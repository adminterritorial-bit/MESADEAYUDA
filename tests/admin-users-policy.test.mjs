import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canManageTarget,
  highestRoleLevel,
  normalizeInstitutionalEmail,
  validateFullName,
  validatePassword,
  validateRoleCode,
  validateRoleTeamConsistency,
  validateTeamCode,
  validateUuid,
} from '../supabase/functions/admin-users/policy.mjs';

test('accepts and normalizes a valid institutional email', () => {
  assert.equal(
    normalizeInstitutionalEmail('  Usuario.Prueba@SANPEDRO-VALLE.GOV.CO '),
    'usuario.prueba@sanpedro-valle.gov.co',
  );
});

test('rejects malformed and external emails', () => {
  assert.throws(() => normalizeInstitutionalEmail('usuario@gmail.com'));
  assert.throws(() => normalizeInstitutionalEmail('a@b.com@sanpedro-valle.gov.co'));
  assert.throws(() => normalizeInstitutionalEmail('@sanpedro-valle.gov.co'));
});

test('normalizes full name and rejects invalid lengths', () => {
  assert.equal(validateFullName('  Ana   Pérez  '), 'Ana Pérez');
  assert.throws(() => validateFullName('A'));
  assert.throws(() => validateFullName('x'.repeat(161)));
});

test('password policy accepts strong values and rejects weak ones', () => {
  assert.equal(validatePassword('ClaveSegura2026!'), 'ClaveSegura2026!');
  assert.throws(() => validatePassword('Corta1!'));
  assert.throws(() => validatePassword('sololetraslargas'));
  assert.throws(() => validatePassword('123456789012'));
  assert.throws(() => validatePassword('A'.repeat(73) + '1!'));
});

test('role and team allowlists reject unknown values', () => {
  assert.equal(validateRoleCode('requester'), 'requester');
  assert.equal(validateTeamCode('TIC'), 'TIC');
  assert.equal(validateTeamCode(''), null);
  assert.throws(() => validateRoleCode('root'));
  assert.throws(() => validateTeamCode('ADMIN'));
});

test('role/team consistency is enforced', () => {
  assert.equal(validateRoleTeamConsistency('communication_agent', 'COM'), true);
  assert.equal(validateRoleTeamConsistency('tic_admin', 'TIC'), true);
  assert.equal(validateRoleTeamConsistency('requester', null), true);
  assert.equal(validateRoleTeamConsistency('secretary_admin', null), true);
  assert.equal(validateRoleTeamConsistency('super_admin', null), true);
  assert.throws(() => validateRoleTeamConsistency('communication_agent', 'TIC'));
  assert.throws(() => validateRoleTeamConsistency('tic_admin', 'COM'));
  assert.throws(() => validateRoleTeamConsistency('requester', 'TIC'));
  assert.throws(() => validateRoleTeamConsistency('requester', 'COM'));
  assert.throws(() => validateRoleTeamConsistency('super_admin', 'TIC'));
});

test('UUID validation rejects arbitrary target identifiers', () => {
  const id = 'b3b7ad06-0670-4ce0-9d47-5f550f3188dc';
  assert.equal(validateUuid(id), id);
  assert.throws(() => validateUuid('1 OR 1=1'));
  assert.throws(() => validateUuid(''));
});

test('role hierarchy is ordered correctly', () => {
  assert.equal(highestRoleLevel(['requester']), 10);
  assert.equal(highestRoleLevel(['tic_admin', 'requester']), 30);
  assert.equal(highestRoleLevel(['super_admin']), 50);
});

test('lower administrative levels cannot manage equal or higher accounts', () => {
  assert.equal(
    canManageTarget({ callerRoles: ['tic_admin'], targetRoles: ['tic_admin'] }).allowed,
    false,
  );
  assert.equal(
    canManageTarget({ callerRoles: ['tic_admin'], targetRoles: ['secretary_admin'] }).allowed,
    false,
  );
  assert.equal(
    canManageTarget({ callerRoles: ['secretary_admin'], targetRoles: ['tic_admin'] }).allowed,
    true,
  );
  assert.equal(
    canManageTarget({ callerRoles: ['super_admin'], targetRoles: ['super_admin'] }).allowed,
    true,
  );
});

test('role assignment follows administrative hierarchy', () => {
  assert.equal(
    canManageTarget({ callerRoles: ['tic_admin'], requestedRole: 'communication_agent' }).allowed,
    true,
  );
  assert.equal(
    canManageTarget({ callerRoles: ['tic_admin'], requestedRole: 'tic_admin' }).allowed,
    false,
  );
  assert.equal(
    canManageTarget({ callerRoles: ['secretary_admin'], requestedRole: 'tic_admin' }).allowed,
    true,
  );
  assert.equal(
    canManageTarget({ callerRoles: ['secretary_admin'], requestedRole: 'secretary_admin' }).allowed,
    false,
  );
  assert.equal(
    canManageTarget({ callerRoles: ['super_admin'], requestedRole: 'super_admin' }).allowed,
    true,
  );
});

test('admin reset endpoint must not be used for own password', () => {
  assert.equal(
    canManageTarget({
      callerRoles: ['super_admin'],
      targetRoles: ['super_admin'],
      sameUser: true,
    }).allowed,
    false,
  );
});
