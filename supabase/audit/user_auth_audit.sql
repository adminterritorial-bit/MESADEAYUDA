-- Mesa de Ayuda TIC
-- Auditoría READ ONLY de usuarios y autenticación.
-- No muestra hashes de contraseñas ni secretos.

with role_summary as (
  select
    profile_id,
    array_agg(distinct role_code order by role_code) as roles,
    count(distinct role_code) as role_count
  from public.profile_roles
  group by profile_id
),
team_summary as (
  select
    profile_id,
    array_agg(distinct team_code order by team_code) as teams,
    count(distinct team_code) as team_count
  from public.profile_teams
  group by profile_id
)
select
  u.id,
  u.email as auth_email,
  p.email as profile_email,
  p.full_name,
  p.status as profile_status,
  u.email_confirmed_at is not null as email_confirmed,
  coalesce(u.encrypted_password, '') <> '' as has_password,
  u.last_sign_in_at,
  u.created_at as auth_created_at,
  coalesce(r.roles, array[]::text[]) as roles,
  coalesce(t.teams, array[]::text[]) as teams,
  case
    when p.id is null then 'ERROR: sin perfil'
    when lower(coalesce(p.email,'')) <> lower(coalesce(u.email,'')) then 'ERROR: correo Auth/perfil diferente'
    when p.status is distinct from 'active' then 'REVISAR: perfil no activo'
    when u.email_confirmed_at is null then 'REVISAR: correo no confirmado'
    when coalesce(u.encrypted_password,'') = '' then 'REVISAR: sin contraseña local (puede ser OAuth)'
    when coalesce(r.role_count,0) = 0 then 'ERROR: sin rol'
    when coalesce(r.role_count,0) > 1 then 'ERROR: múltiples roles; la UI está diseñada para un rol principal'
    when coalesce(t.team_count,0) > 1 then 'ERROR: múltiples equipos operativos'
    when 'communication_agent' = any(coalesce(r.roles, array[]::text[]))
         and not ('COM' = any(coalesce(t.teams, array[]::text[])))
      then 'ERROR: Comunicaciones sin equipo COM'
    when 'tic_admin' = any(coalesce(r.roles, array[]::text[]))
         and not ('TIC' = any(coalesce(t.teams, array[]::text[])))
      then 'ERROR: Administrador TIC sin equipo TIC'
    when 'requester' = any(coalesce(r.roles, array[]::text[]))
         and exists (select 1 from unnest(coalesce(t.teams,array[]::text[])) x where x <> 'FUNC')
      then 'ERROR: requester con equipo operativo'
    when 'secretary_admin' = any(coalesce(r.roles, array[]::text[]))
         and exists (select 1 from unnest(coalesce(t.teams,array[]::text[])) x where x <> 'FUNC')
      then 'ERROR: Secretario con equipo operativo inesperado'
    else 'OK'
  end as audit_status
from auth.users u
left join public.profiles p on p.id = u.id
left join role_summary r on r.profile_id = u.id
left join team_summary t on t.profile_id = u.id
order by
  case
    when p.id is null then 0
    when coalesce(r.role_count,0) <> 1 then 0
    else 1
  end,
  lower(coalesce(u.email,''));

-- Perfiles huérfanos: existen en public.profiles pero no en Auth.
select
  p.id,
  p.email,
  p.full_name,
  p.status,
  'ERROR: perfil sin cuenta Auth' as audit_status
from public.profiles p
left join auth.users u on u.id = p.id
where u.id is null
order by lower(coalesce(p.email,''));

-- Correos duplicados en perfiles (case-insensitive).
select
  lower(email) as normalized_email,
  count(*) as profiles,
  array_agg(id order by id) as profile_ids
from public.profiles
where email is not null
group by lower(email)
having count(*) > 1
order by profiles desc, normalized_email;

-- Cuentas Auth duplicadas por correo no deberían existir; se deja como control defensivo.
select
  lower(email) as normalized_email,
  count(*) as auth_accounts,
  array_agg(id order by id) as auth_user_ids
from auth.users
where email is not null
group by lower(email)
having count(*) > 1
order by auth_accounts desc, normalized_email;
