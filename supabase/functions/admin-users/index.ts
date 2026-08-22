import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function validPassword(value: unknown) {
  const password = String(value || '');
  if (password.length < 8) throw new Error('La contraseña debe tener mínimo 8 caracteres.');
  if (password.length > 72) throw new Error('La contraseña no puede superar 72 caracteres.');
  return password;
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
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');

  if (action === 'change_own_password') {
    try {
      const password = validPassword(body.password);
      const { error } = await admin.auth.admin.updateUserById(callerId, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Contraseña inválida' }, 400);
    }
  }

  const { data: allowed, error: permError } = await admin.rpc('has_permission_for_user', {
    p_user_id: callerId,
    p_permission: 'users.manage',
  }).maybeSingle();
  if (permError || !allowed) return json({ error: 'No autorizado para administrar usuarios' }, 403);

  if (action === 'reset_password') {
    try {
      const userId = String(body.user_id || '').trim();
      const password = validPassword(body.password);
      if (!userId) return json({ error: 'Falta el usuario' }, 400);
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, user_id: userId });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Contraseña inválida' }, 400);
    }
  }

  if (action !== 'upsert_user') return json({ error: 'Acción no soportada' }, 400);

  const email = String(body.email || '').trim().toLowerCase();
  const fullName = String(body.full_name || '').trim();
  const roleCode = String(body.role_code || 'requester').trim();
  const teamCode = String(body.team_code || '').trim() || null;
  const password = String(body.password || '').trim() || null;

  if (!email.endsWith('@sanpedro-valle.gov.co')) return json({ error: 'Solo se permiten correos @sanpedro-valle.gov.co' }, 400);
  if (!fullName) return json({ error: 'El nombre completo es obligatorio' }, 400);
  if (password) {
    try { validPassword(password); } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Contraseña inválida' }, 400);
    }
  }

  const createPayload: Record<string, unknown> = { email, email_confirm: true, user_metadata: { full_name: fullName } };
  if (password) createPayload.password = password;

  let userId: string | null = null;
  const { data: created, error: createError } = await admin.auth.admin.createUser(createPayload);
  if (createError) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list.users.find((u) => u.email?.toLowerCase() === email);
    if (!existing) return json({ error: createError.message }, 400);
    userId = existing.id;
    const updates: Record<string, unknown> = { user_metadata: { full_name: fullName } };
    if (password) updates.password = password;
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, updates);
    if (updateError) return json({ error: updateError.message }, 400);
  } else {
    userId = created.user?.id ?? null;
  }

  if (!userId) return json({ error: 'No se pudo obtener el ID del usuario' }, 500);

  const { error: rpcError } = await admin.rpc('admin_upsert_profile', {
    p_profile_id: userId,
    p_email: email,
    p_full_name: fullName,
    p_role_code: roleCode,
    p_team_code: teamCode,
    p_actor_id: callerId,
  });
  if (rpcError) return json({ error: rpcError.message }, 400);

  return json({ ok: true, user_id: userId, email, role_code: roleCode, team_code: teamCode });
});
