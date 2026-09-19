-- Mesa de Ayuda TIC
-- Auditoría READ ONLY de seguridad PostgreSQL/Supabase
-- Fecha: 2026-09-18
-- No modifica datos ni esquema.

-- 1. Tablas y RLS en public.
select
  n.nspname as schema_name,
  c.relname as object_name,
  case c.relkind when 'r' then 'table' when 'p' then 'partitioned_table' else c.relkind::text end as object_type,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r','p')
order by c.relrowsecurity asc, c.relname;

-- 2. Políticas RLS existentes.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3. Grants directos de anon/authenticated sobre tablas y vistas.
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated')
order by table_name, grantee, privilege_type;

-- 4. Vistas expuestas. En PostgreSQL 15+ las vistas que deban respetar RLS
-- deberían tener reloptions que incluyan security_invoker=true.
select
  n.nspname as schema_name,
  c.relname as view_name,
  c.reloptions,
  pg_get_viewdef(c.oid, true) as definition
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
order by c.relname;

-- 5. Funciones SECURITY DEFINER, search_path y ACL.
select
  n.nspname as schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  p.proacl as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.prosecdef desc, p.proname;

-- 6. Privilegios de funciones otorgados a roles cliente.
select
  routine_schema,
  routine_name,
  grantee,
  privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public'
  and grantee in ('PUBLIC','anon','authenticated')
order by routine_name, grantee;

-- 7. Integridad entre Auth y perfiles.
select
  u.id,
  u.email,
  u.created_at,
  p.id as profile_id,
  p.status as profile_status
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
   or coalesce(p.status,'') <> 'active'
order by u.created_at desc;

-- 8. Perfiles sin usuario Auth.
select
  p.id,
  p.email,
  p.full_name,
  p.status
from public.profiles p
left join auth.users u on u.id = p.id
where u.id is null
order by p.email;

-- 9. Usuarios sin roles.
select
  p.id,
  p.email,
  p.full_name,
  p.status
from public.profiles p
left join public.profile_roles pr on pr.profile_id = p.id
where pr.profile_id is null
order by p.email;

-- 10. Roles fuera del catálogo esperado por el frontend/backend.
select
  profile_id,
  role_code
from public.profile_roles
where role_code not in (
  'requester',
  'communication_agent',
  'tic_admin',
  'secretary_admin',
  'super_admin'
)
order by role_code, profile_id;

-- 11. Equipos fuera del catálogo esperado.
select
  profile_id,
  team_code
from public.profile_teams
where team_code not in ('TIC','COM')
order by team_code, profile_id;

-- 12. Duplicados de asignación de rol/equipo.
select profile_id, role_code, count(*) as duplicates
from public.profile_roles
group by profile_id, role_code
having count(*) > 1
order by duplicates desc;

select profile_id, team_code, count(*) as duplicates
from public.profile_teams
group by profile_id, team_code
having count(*) > 1
order by duplicates desc;

-- 13. Objetos críticos que el frontend espera encontrar.
select
  expected.object_name,
  to_regclass('public.' || expected.object_name) as resolved_object
from (
  values
    ('profiles'),
    ('profile_roles'),
    ('profile_teams'),
    ('tickets'),
    ('ticket_messages'),
    ('notifications'),
    ('notification_delivery_queue'),
    ('knowledge_articles'),
    ('activities'),
    ('app_settings'),
    ('ticket_attachments'),
    ('tickets_secure'),
    ('schedule_activities_public')
) as expected(object_name)
order by expected.object_name;

-- 14. Funciones/RPC críticos esperados.
select
  expected.function_name,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = expected.function_name
  ) as exists_in_database
from (
  values
    ('app_bootstrap'),
    ('create_ticket'),
    ('create_activity'),
    ('create_activity_v2'),
    ('create_activity_for_ticket_v2'),
    ('get_my_tutorial_status'),
    ('mark_tutorial_seen'),
    ('is_admin'),
    ('can_access_team'),
    ('admin_upsert_profile'),
    ('has_permission_for_user')
) as expected(function_name)
order by expected.function_name;
