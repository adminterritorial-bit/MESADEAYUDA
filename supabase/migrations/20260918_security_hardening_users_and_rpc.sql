create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table if exists public.auth_users_password_backup_20260821
  set schema private;
revoke all on table private.auth_users_password_backup_20260821
  from public, anon, authenticated;

alter function public.set_updated_at() set search_path = public;
alter function public.set_ticket_status_timestamps() set search_path = public;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', r.signature);
  end loop;
end $$;

revoke execute on function public.current_profile_id() from authenticated;
revoke execute on function public.ensure_launch_profile() from authenticated;
revoke execute on function public.next_ticket_number() from authenticated;
revoke execute on function public.notify_ticket_tracking() from authenticated;
revoke execute on function public.refresh_schedule_resource_names() from authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.set_ticket_status_timestamps() from public, anon, authenticated;

grant execute on function public.app_bootstrap() to authenticated;
grant execute on function public.can_access_team(text) to authenticated;
grant execute on function public.create_activity(text,text,timestamptz,timestamptz,text) to authenticated;
grant execute on function public.create_activity_for_ticket_v2(uuid,text,text,timestamptz,timestamptz,text,text,text) to authenticated;
grant execute on function public.create_activity_v2(text,text,timestamptz,timestamptz,text,text,text,boolean,text,text) to authenticated;
grant execute on function public.create_ticket(text,text,text,jsonb,date) to authenticated;
grant execute on function public.get_my_tutorial_status(text) to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.has_role(text) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.mark_tutorial_seen(text) to authenticated;

create or replace function public.admin_upsert_profile(
  p_profile_id uuid,
  p_email text,
  p_full_name text,
  p_role_code text,
  p_team_code text,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor_level integer := 0;
  v_target_level integer := 0;
  v_requested_level integer := 0;
begin
  if not public.has_permission_for_user(p_actor_id, 'users.manage') then
    raise exception 'No autorizado para administrar usuarios.';
  end if;

  if lower(trim(p_email)) !~ '^[^@[:space:]]+@sanpedro-valle[.]gov[.]co$' then
    raise exception 'Solo se permiten correos institucionales válidos.';
  end if;

  if nullif(trim(coalesce(p_full_name,'')), '') is null
     or length(trim(p_full_name)) < 3
     or length(trim(p_full_name)) > 160 then
    raise exception 'Nombre completo inválido.';
  end if;

  if not exists (select 1 from public.roles where code = p_role_code) then
    raise exception 'Rol no permitido.';
  end if;

  if p_team_code is not null
     and p_team_code <> ''
     and not exists (select 1 from public.teams where code = p_team_code) then
    raise exception 'Equipo no permitido.';
  end if;

  select coalesce(max(case pr.role_code
    when 'requester' then 10
    when 'communication_agent' then 20
    when 'tic_admin' then 30
    when 'secretary_admin' then 40
    when 'super_admin' then 50
    else 0 end),0)
  into v_actor_level
  from public.profile_roles pr
  where pr.profile_id = p_actor_id;

  select coalesce(max(case pr.role_code
    when 'requester' then 10
    when 'communication_agent' then 20
    when 'tic_admin' then 30
    when 'secretary_admin' then 40
    when 'super_admin' then 50
    else 0 end),0)
  into v_target_level
  from public.profile_roles pr
  where pr.profile_id = p_profile_id;

  v_requested_level := case p_role_code
    when 'requester' then 10
    when 'communication_agent' then 20
    when 'tic_admin' then 30
    when 'secretary_admin' then 40
    when 'super_admin' then 50
    else 0 end;

  if v_actor_level = 0 then
    raise exception 'Rol administrativo no reconocido.';
  end if;

  if v_target_level > 0
     and v_actor_level <= v_target_level
     and not (v_actor_level = 50 and v_target_level = 50) then
    raise exception 'No puedes administrar una cuenta con nivel igual o superior.';
  end if;

  if v_actor_level <= v_requested_level
     and not (v_actor_level = 50 and v_requested_level = 50) then
    raise exception 'No puedes asignar un rol con nivel igual o superior.';
  end if;

  if p_role_code = 'communication_agent' and coalesce(p_team_code,'') <> 'COM' then
    raise exception 'El rol de Comunicaciones exige equipo COM.';
  end if;

  if p_role_code = 'tic_admin' and coalesce(p_team_code,'') <> 'TIC' then
    raise exception 'El Administrador TIC exige equipo TIC.';
  end if;

  if p_role_code = 'requester'
     and coalesce(p_team_code,'') not in ('','FUNC') then
    raise exception 'El funcionario solicitante solo puede estar sin equipo o en FUNC.';
  end if;

  if p_role_code = 'secretary_admin'
     and coalesce(p_team_code,'') not in ('','FUNC') then
    raise exception 'El Secretario General solo puede estar sin equipo o en FUNC.';
  end if;

  insert into public.profiles(id,email,full_name,status)
  values(p_profile_id, lower(trim(p_email)), trim(p_full_name), 'active')
  on conflict(id) do update
    set email=excluded.email,
        full_name=excluded.full_name,
        status='active',
        updated_at=now();

  delete from public.profile_roles where profile_id = p_profile_id;
  insert into public.profile_roles(profile_id, role_code, assigned_by)
  values(p_profile_id, p_role_code, p_actor_id);

  delete from public.profile_teams where profile_id = p_profile_id;
  if p_team_code is not null and p_team_code <> '' then
    insert into public.profile_teams(profile_id, team_code, assigned_by)
    values(p_profile_id, p_team_code, p_actor_id);
  end if;

  update public.schedule_resources
  set profile_id = null, updated_at = now()
  where profile_id = p_profile_id;

  if p_role_code = 'tic_admin'
     or (p_role_code = 'super_admin' and p_team_code = 'TIC') then
    update public.schedule_resources
    set profile_id=p_profile_id, updated_at=now()
    where code='admin_tic';
  elsif p_role_code = 'communication_agent' then
    update public.schedule_resources
    set profile_id=p_profile_id, updated_at=now()
    where code = coalesce(
      (select code from public.schedule_resources where team_code='COM' and profile_id is null order by display_order limit 1),
      (select code from public.schedule_resources where team_code='COM' order by display_order limit 1)
    );
  end if;
end;
$function$;

revoke all on function public.admin_upsert_profile(uuid,text,text,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.admin_upsert_profile(uuid,text,text,text,text,uuid)
  to service_role;
