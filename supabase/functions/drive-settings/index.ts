import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const PIN_SHA256 = '2cec8cf0e321c284fa0c2ebef804aac18bf1cbb85546f89e7e3d0b6aa8b9d2cf';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Variables de entorno Supabase no configuradas' }, 500);
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'No autenticado' }, 401);

  const admin = createClient(url, serviceKey);
  const token = authHeader.replace('Bearer ', '');
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'Sesión inválida' }, 401);

  const callerId = userData.user.id;
  const { data: allowed } = await admin.rpc('has_permission_for_user', {
    p_user_id: callerId,
    p_permission: 'users.manage',
  }).maybeSingle();
  if (!allowed) return json({ error: 'No autorizado para cambiar la conexión institucional' }, 403);

  const body = await req.json().catch(() => ({}));
  if (await sha256(String(body.pin || '')) !== PIN_SHA256) return json({ error: 'PIN incorrecto' }, 403);

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
  return json({ ok: true, url: value });
});
