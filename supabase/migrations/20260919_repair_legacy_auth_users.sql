-- 2026-09-19
-- Reparación de cuentas Auth recreadas históricamente.
-- 1) Normaliza email_verified en identidades ya confirmadas.
-- 2) Restaura hashes bcrypt históricos SOLO para cuentas recreadas
--    con UUID distinto que nunca habían iniciado sesión.
-- No altera perfiles, roles, equipos ni cuentas que ya habían iniciado sesión.

update auth.identities i
set
  identity_data = jsonb_set(
    coalesce(i.identity_data, '{}'::jsonb),
    '{email_verified}',
    'true'::jsonb,
    true
  ),
  updated_at = now()
from auth.users u
where i.user_id = u.id
  and i.provider = 'email'
  and u.email_confirmed_at is not null
  and lower(coalesce(i.email, i.identity_data->>'email', '')) = lower(coalesce(u.email,''))
  and coalesce((i.identity_data->>'email_verified')::boolean, false) = false;

update auth.users
set
  raw_user_meta_data = jsonb_set(
    coalesce(raw_user_meta_data, '{}'::jsonb),
    '{email_verified}',
    'true'::jsonb,
    true
  ),
  updated_at = now()
where email_confirmed_at is not null
  and coalesce((raw_user_meta_data->>'email_verified')::boolean, false) = false;

with candidates as (
  select
    u.id as current_id,
    b.encrypted_password as legacy_hash
  from auth.users u
  join private.auth_users_password_backup_20260821 b
    on lower(b.email)=lower(u.email)
  where u.id <> b.id
    and u.last_sign_in_at is null
    and b.encrypted_password like '$2%'
)
update auth.users u
set
  encrypted_password = c.legacy_hash,
  updated_at = now()
from candidates c
where u.id = c.current_id;
