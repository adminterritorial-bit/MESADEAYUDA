import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import {
  canManageTarget,
  normalizeInstitutionalEmail,
  validateFullName,
  validatePassword,
  validateRoleCode,
  validateRoleTeamConsistency,
  validateTeamCode,
  validateUuid,
} from './policy.mjs';

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

async function findUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const perPage = 1000;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < perPage) return null;
  }

  throw new Error('No fue posible completar la búsqueda de usuarios.');
}

async function getRoleCodes(admin: ReturnType<typeof createClient>, profileId: string) {
  const { data, error } = await admin
    .from('profile_roles')
    .select('role_code')
    .eq('profile_id', profileId);

  if (error) throw error;
  return (data || []).map((row) => String(row.role_code || '')).filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Variables de entorno Supabase no configuradas' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'No autenticado' }, 401);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return json({ error: 'No autenticado' }, 401);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'Sesión inválida' }, 401);

  const callerId = userData.user.id;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '').trim();

  const { data: allowed, error: permError } = await admin.rpc('has_permission_for_user', {
    p_user_id: callerId,
    p_permission: 'users.manage',
  }).maybeSingle();

  if (permError || !allowed) {
    console.warn('admin-users denied', { callerId, action, permissionError: permError?.message || null });
    return json({ error: 'No autorizado para administrar usuarios' }, 403);
  }

  let callerRoles: string[];
  try {
    callerRoles = await getRoleCodes(admin, callerId);
  } catch (error) {
    console.error('No fue posible resolver roles del administrador', error);
    return json({ error: 'No fue posible validar los privilegios del administrador.' }, 500);
  }

  if (action === 'reset_password') {
    try {
      const userId = validateUuid(body.user_id, 'Usuario');
      const password = validatePassword(body.password);

      const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(userId);
      if (targetError || !targetData.user) return json({ error: 'Usuario no encontrado' }, 404);

      const targetRoles = await getRoleCodes(admin, userId);
      const targetGuard = canManageTarget({
        callerRoles,
        targetRoles,
        sameUser: userId === callerId,
      });

      if (!targetGuard.allowed) return json({ error: targetGuard.reason }, 403);

      const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password });
      if (updateError) return json({ error: updateError.message }, 400);

      console.info('admin-users password reset', { callerId, userId });
      return json({ ok: true, user_id: userId });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Contraseña inválida' }, 400);
    }
  }

  if (action === 'create_user') {
    let createdUserId: string | null = null;

    try {
      const email = normalizeInstitutionalEmail(body.email);
      const fullName = validateFullName(body.full_name);
      const roleCode = validateRoleCode(body.role_code || 'requester');
      const teamCode = validateTeamCode(body.team_code);
      const password = validatePassword(body.password);
      validateRoleTeamConsistency(roleCode, teamCode);

      const roleGuard = canManageTarget({ callerRoles, requestedRole: roleCode });
      if (!roleGuard.allowed) return json({ error: roleGuard.reason }, 403);

      const existing = await findUserByEmail(admin, email);
      if (existing) {
        return json({
          error: 'Ya existe una cuenta con este correo. Usa la gestión del usuario existente; crear usuario nunca sobrescribe una cuenta.',
          code: 'USER_ALREADY_EXISTS',
          user_id: existing.id,
        }, 409);
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError || !created.user?.id) {
        return json({ error: createError?.message || 'No se pudo crear el usuario en Auth.' }, 400);
      }

      createdUserId = created.user.id;

      const { error: rpcError } = await admin.rpc('admin_upsert_profile', {
        p_profile_id: createdUserId,
        p_email: email,
        p_full_name: fullName,
        p_role_code: roleCode,
        p_team_code: teamCode,
        p_actor_id: callerId,
      });

      if (rpcError) {
        console.error('Fallo creando perfil; se intentará rollback del usuario Auth', {
          callerId,
          createdUserId,
          message: rpcError.message,
        });

        const { error: rollbackError } = await admin.auth.admin.deleteUser(createdUserId);
        if (rollbackError) {
          console.error('Rollback Auth falló', { createdUserId, message: rollbackError.message });
          return json({
            error: 'La cuenta Auth se creó pero falló el perfil y no pudo revertirse automáticamente. Requiere revisión administrativa.',
            code: 'PARTIAL_USER_CREATION',
            user_id: createdUserId,
          }, 500);
        }

        return json({
          error: 'No se pudo completar el perfil del usuario. La creación fue revertida para evitar una cuenta huérfana.',
          code: 'PROFILE_CREATION_FAILED',
        }, 400);
      }

      console.info('admin-users user created', { callerId, createdUserId, roleCode, teamCode });
      return json({
        ok: true,
        user_id: createdUserId,
        email,
        role_code: roleCode,
        team_code: teamCode,
        created: true,
      }, 201);
    } catch (error) {
      if (createdUserId) console.error('Error posterior a creación de usuario', { createdUserId, error });
      return json({ error: error instanceof Error ? error.message : 'Datos de usuario inválidos' }, 400);
    }
  }

  if (action === 'update_user') {
    try {
      const userId = validateUuid(body.user_id, 'Usuario');
      const fullName = validateFullName(body.full_name);
      const roleCode = validateRoleCode(body.role_code);
      const teamCode = validateTeamCode(body.team_code);
      validateRoleTeamConsistency(roleCode, teamCode);

      const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(userId);
      if (targetError || !targetData.user) return json({ error: 'Usuario no encontrado' }, 404);

      const targetRoles = await getRoleCodes(admin, userId);
      const targetGuard = canManageTarget({
        callerRoles,
        targetRoles,
        requestedRole: roleCode,
        sameUser: userId === callerId,
      });
      if (!targetGuard.allowed) return json({ error: targetGuard.reason }, 403);

      const currentMetadata = targetData.user.user_metadata || {};
      const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: { ...currentMetadata, full_name: fullName },
      });
      if (metadataError) return json({ error: metadataError.message }, 400);

      const email = normalizeInstitutionalEmail(targetData.user.email);
      const { error: rpcError } = await admin.rpc('admin_upsert_profile', {
        p_profile_id: userId,
        p_email: email,
        p_full_name: fullName,
        p_role_code: roleCode,
        p_team_code: teamCode,
        p_actor_id: callerId,
      });
      if (rpcError) return json({ error: rpcError.message }, 400);

      console.info('admin-users user updated', { callerId, userId, roleCode, teamCode });
      return json({ ok: true, user_id: userId, role_code: roleCode, team_code: teamCode });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Datos de usuario inválidos' }, 400);
    }
  }

  return json({ error: 'Acción no soportada' }, 400);
});
