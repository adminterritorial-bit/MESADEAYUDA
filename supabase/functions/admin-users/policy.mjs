export const ALLOWED_ROLE_CODES = Object.freeze([
  'requester',
  'communication_agent',
  'tic_admin',
  'secretary_admin',
  'super_admin',
]);

export const ALLOWED_TEAM_CODES = Object.freeze(['TIC', 'COM', 'FUNC']);

const roleSet = new Set(ALLOWED_ROLE_CODES);
const teamSet = new Set(ALLOWED_TEAM_CODES);
const institutionalEmail = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@sanpedro-valle\.gov\.co$/i;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeInstitutionalEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!institutionalEmail.test(email)) {
    throw new Error('Solo se permiten correos institucionales válidos @sanpedro-valle.gov.co');
  }
  return email;
}

export function validateFullName(value) {
  const fullName = String(value || '').trim().replace(/\s+/g, ' ');
  if (fullName.length < 3 || fullName.length > 160) {
    throw new Error('El nombre completo debe tener entre 3 y 160 caracteres.');
  }
  return fullName;
}

export function validateRoleCode(value) {
  const roleCode = String(value || '').trim();
  if (!roleSet.has(roleCode)) throw new Error('Rol no permitido');
  return roleCode;
}

export function validateTeamCode(value) {
  const teamCode = String(value || '').trim();
  if (!teamCode) return null;
  if (!teamSet.has(teamCode)) throw new Error('Equipo no permitido');
  return teamCode;
}

export function validateUuid(value, label = 'Usuario') {
  const id = String(value || '').trim();
  if (!uuidPattern.test(id)) throw new Error(label + ' inválido');
  return id;
}

export function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 12) throw new Error('La contraseña debe tener mínimo 12 caracteres.');
  if (password.length > 72) throw new Error('La contraseña no puede superar 72 caracteres.');

  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  if (classes < 3) {
    throw new Error('La contraseña debe combinar al menos tres grupos: minúsculas, mayúsculas, números y símbolos.');
  }

  return password;
}

const ROLE_LEVEL = Object.freeze({
  requester: 10,
  communication_agent: 20,
  tic_admin: 30,
  secretary_admin: 40,
  super_admin: 50,
});

export function highestRoleLevel(roles = []) {
  return roles.reduce((max, role) => Math.max(max, ROLE_LEVEL[role] || 0), 0);
}

export function canManageTarget({ callerRoles = [], targetRoles = [], requestedRole = null, sameUser = false }) {
  if (sameUser) {
    return { allowed: false, reason: 'Usa la opción Mi contraseña para cambiar tu propia clave.' };
  }

  const callerLevel = highestRoleLevel(callerRoles);
  if (!callerLevel) return { allowed: false, reason: 'El administrador no tiene un rol reconocido.' };

  if (targetRoles.length) {
    const targetLevel = highestRoleLevel(targetRoles);
    const topPeerException = callerLevel === ROLE_LEVEL.super_admin && targetLevel === ROLE_LEVEL.super_admin;
    if (callerLevel <= targetLevel && !topPeerException) {
      return { allowed: false, reason: 'No puedes administrar una cuenta con un nivel de privilegio igual o superior al tuyo.' };
    }
  }

  if (requestedRole) {
    const requestedLevel = ROLE_LEVEL[requestedRole] || 0;
    const topPeerException = callerLevel === ROLE_LEVEL.super_admin && requestedLevel === ROLE_LEVEL.super_admin;
    if (callerLevel <= requestedLevel && !topPeerException) {
      return { allowed: false, reason: 'No puedes asignar un rol con un nivel de privilegio igual o superior al tuyo.' };
    }
  }

  return { allowed: true, reason: '' };
}

export function validateRoleTeamConsistency(roleCode, teamCode) {
  if (roleCode === 'communication_agent' && teamCode !== 'COM') {
    throw new Error('El rol Comunicaciones debe pertenecer al equipo COM.');
  }
  if (roleCode === 'tic_admin' && teamCode !== 'TIC') {
    throw new Error('El rol Administrador TIC debe pertenecer al equipo TIC.');
  }
  if (roleCode === 'requester' && ![null, 'FUNC'].includes(teamCode)) {
    throw new Error('El funcionario solicitante solo puede estar sin equipo o en FUNC.');
  }
  if (roleCode === 'secretary_admin' && ![null, 'FUNC'].includes(teamCode)) {
    throw new Error('El Secretario General solo puede estar sin equipo o en FUNC.');
  }
  return true;
}
