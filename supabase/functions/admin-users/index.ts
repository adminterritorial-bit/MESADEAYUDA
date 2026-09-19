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

async function findUserByEmail(admin: any, email: string): Promise<any | null> {
  const perPage = 1000;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const found = data.users.find((user: any) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < perPage) return null;
  }

  throw new Error('No fue posible completar la búsqueda de usuarios.');
}

async function getRoleCodes(admin: any, profileId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('profile_roles')
    .select('role_code')
    .eq('profile_id', profileId);

  if (error) throw error;
  return (data || []).map((row: any) => String(row.role_code || '')).filter(Boolean);
}

async function sha1Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

async function assertPasswordNotPwned(password: string): Promise<void> {
  const hash = await sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  let response: Response;
  try {
    response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: {
        'Add-Padding': 'true',
        'User-Agent': 'Mesa-Ayuda-TIC-password-security',
      },
    });
  } catch (_error) {
    throw new Error('No fue posible verificar la contraseña contra filtraciones conocidas. Intenta nuevamente.');
  }

  if (!response.ok) {
    throw new Error('No fue posible verificar la contraseña contra filtraciones conocidas. Intenta nuevamente.');
  }

  const leaked = (await response.text())
    .split(/\r?\n/)
    .some((line) => line.split(':', 1)[0]?.trim().toUpperCase() === suffix);

  if (leaked) {
    throw new Error('Esta contraseña aparece en filtraciones conocidas. Elige una contraseña diferente y única.');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) return json({ error: 'Variables de entorno Supabase no configuradas' }, 500);

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

  if (action === 'validate_recovery_password') {
    try {
      const password = validatePassword(body.password);
      await assertPasswordNotPwned(password);
      return json({ ok: true });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Contraseña inválida' }, 400);
    }
  }

  if (action === 'change_own_password') {
    try {
      const currentPassword = String(body.current_password || '');
      const password = validatePassword(body.password);
      const callerEmail = String(userData.user.email || '').trim().toLowerCase();

      if (!currentPassword) return json({ error: 'Debes ingresar tu contraseña actual.' }, 400);
      if (!callerEmail) return json({ error: 'La cuenta no tiene un correo válido.' }, 400);
      if (currentPassword === password) return json({ error: 'La nueva contraseña debe ser diferente a la actual.' }, 400);

      await assertPasswordNotPwned(password);

      const verifier = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: reauthError } = await verifier.auth.signInWithPassword({
        email: callerEmail,
        password: currentPassword,
      });
      if (reauthError) return json({ error: 'La contraseña actual no es correcta.' }, 403);

      const { error: updateError } = await admin.auth.admin.updateUserById(callerId, { password });
      if (updateError) return json({ error: updateError.message }, 400);

      console.info('admin-users own password changed', { callerId });
      return json({ ok: true });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Contraseña inválida' }, 400);
    }
  }

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

  if (action === 'generate_recovery_link') {
    try {
      const userId = validateUuid(body.user_id, 'Usuario');
      const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(userId);
      if (targetError || !targetData.user?.email) return json({ error: 'Usuario no encontrado' }, 404);

      const targetRoles = await getRoleCodes(admin, userId);
      const targetGuard = canManageTarget({
        callerRoles,
        targetRoles,
        sameUser: userId === callerId,
      });
      if (!targetGuard.allowed) return json({ error: targetGuard.reason }, 403);

      const redirectTo = 'https://adminterritorial-bit.github.io/MESADEAYUDA/';
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: String(targetData.user.email).trim().toLowerCase(),
        options: { redirectTo },
      });

      if (linkError || !linkData?.properties?.action_link) {
        return json({ error: linkError?.message || 'No fue posible generar el enlace de recuperación.' }, 400);
      }

      console.info('admin-users recovery link generated', { callerId, userId });
      return json({
        ok: true,
        user_id: userId,
        recovery_url: linkData.properties.action_link,
        redirect_to: redirectTo,
      });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'No fue posible generar el enlace.' }, 400);
    }
  }

  if (action === 'reset_password') {
    try {
      const userId = validateUuid(body.user_id, 'Usuario');
      const password = validatePassword(body.password);
      await assertPasswordNotPwned(password);

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
      await assertPasswordNotPwned(password);
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
