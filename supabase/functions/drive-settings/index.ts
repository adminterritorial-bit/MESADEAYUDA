import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!url || !serviceKey || !anonKey) {
    return json({ error: 'Variables de entorno Supabase no configuradas' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'No autenticado' }, 401);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authHeader.slice('Bearer '.length).trim();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'Sesión inválida' }, 401);

  const callerId = userData.user.id;
  const callerEmail = String(userData.user.email || '').trim().toLowerCase();
  if (!callerEmail) return json({ error: 'La cuenta administrativa no tiene correo válido' }, 400);

  const { data: allowed, error: permissionError } = await admin.rpc('has_permission_for_user', {
    p_user_id: callerId,
    p_permission: 'users.manage',
  }).maybeSingle();

  if (permissionError || !allowed) {
    return json({ error: 'No autorizado para cambiar la conexión institucional' }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const password = String(body.password || '');
  if (!password) return json({ error: 'Debes confirmar tu contraseña actual' }, 400);

  const verifier = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: passwordError } = await verifier.auth.signInWithPassword({
    email: callerEmail,
    password,
  });

  if (passwordError) {
    console.warn('drive-settings reauthentication failed', { callerId });
    return json({ error: 'La contraseña actual no es correcta' }, 403);
  }

  const value = String(body.url || '').trim().replace(/\/$/, '');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(value)) {
    return json({ error: 'La URL debe ser un Web App válido de Google Apps Script terminado en /exec' }, 400);
  }

  const { error } = await admin.from('app_settings').upsert({
    key: 'drive_upload_webapp_url',
    value,
    updated_by: callerId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });

  if (error) return json({ error: error.message }, 400);

  console.info('drive-settings updated', { callerId });
  return json({ ok: true, url: value });
});
