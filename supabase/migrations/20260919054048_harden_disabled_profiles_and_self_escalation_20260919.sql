-- 2026-09-19
-- Cierra bypass de cuentas disabled en helpers/RLS y evita auto-reactivación/self-escalation.

create or replace function public.has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists(
    select 1
    from public.profiles p
    join public.profile_roles pr on pr.profile_id = p.id
    where p.id = auth.uid()
      and p.status = 'active'
      and pr.role_code = p_role
  )
$function$;

create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists(
    select 1
    from public.profiles p
    join public.profile_roles pr on pr.profile_id = p.id
    join public.role_permissions rp on rp.role_code = pr.role_code
    where p.id = auth.uid()
      and p.status = 'active'
      and rp.permission_code = p_permission
  )
$function$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists(
    select 1
    from public.profiles p
    join public.profile_roles pr on pr.profile_id = p.id
    join public.roles r on r.code = pr.role_code
    where p.id = auth.uid()
      and p.status = 'active'
      and r.is_admin
  )
$function$;

create or replace function public.can_access_team(p_team text)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists(
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (
        public.has_role('super_admin')
        or public.has_role('secretary_admin')
        or exists(
          select 1
          from public.profile_teams pt
          where pt.profile_id = p.id
            and pt.team_code = p_team
        )
      )
  )
$function$;

create or replace function public.ensure_launch_profile()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_email text;
  v_admin record;
  v_status text;
begin
  if auth.uid() is null then return; end if;

  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then return; end if;

  insert into public.profiles(id,email,full_name,status)
  values(auth.uid(), lower(v_email), coalesce(split_part(v_email,'@',1), v_email), 'pending')
  on conflict(id) do nothing;

  select status into v_status from public.profiles where id = auth.uid();

  select * into v_admin
  from public.launch_admin_emails
  where email = lower(v_email);

  if not found then return; end if;

  if v_status = 'pending' then
    update public.profiles
    set status='active', updated_at=now()
    where id=auth.uid();
    v_status := 'active';
  end if;

  if v_status <> 'active' then return; end if;

  insert into public.profile_roles(profile_id,role_code)
  values(auth.uid(),v_admin.role_code)
  on conflict do nothing;

  if v_admin.team_code is not null then
    insert into public.profile_teams(profile_id,team_code)
    values(auth.uid(),v_admin.team_code)
    on conflict do nothing;

    update public.schedule_resources
    set profile_id=auth.uid(), updated_at=now()
    where code='admin_tic' and v_admin.team_code='TIC';
  end if;
end;
$function$;

create or replace function public.create_activity_v2(
  p_resource_code text,
  p_title text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_kind text default 'support',
  p_description text default null,
  p_location text default null,
  p_is_all_day boolean default false,
  p_visibility text default 'public',
  p_color_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_resource public.schedule_resources%rowtype;
  v_activity public.activities%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.id=auth.uid() and p.status='active'
  ) then
    raise exception 'profile_not_active';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'La actividad necesita un título.';
  end if;

  if p_end_at <= p_start_at then
    raise exception 'La hora de fin debe ser posterior a la hora de inicio.';
  end if;

  select * into v_resource
  from public.schedule_resources
  where code=p_resource_code and is_active;

  if not found then raise exception 'Responsable no disponible.'; end if;

  insert into public.activities(
    resource_code,title,start_at,end_at,kind,description,location,
    is_all_day,visibility,color_label,created_by
  ) values (
    p_resource_code,trim(p_title),p_start_at,p_end_at,
    coalesce(nullif(p_kind,''),'support'),
    nullif(trim(coalesce(p_description,'')),''),
    nullif(trim(coalesce(p_location,'')),''),
    coalesce(p_is_all_day,false),
    coalesce(nullif(p_visibility,''),'public'),
    nullif(trim(coalesce(p_color_label,'')),''),
    auth.uid()
  )
  returning * into v_activity;

  return to_jsonb(v_activity);
end;
$function$;

create or replace function public.create_activity_for_ticket_v2(
  p_ticket_id uuid,
  p_resource_code text,
  p_title text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_kind text default 'support',
  p_description text default null,
  p_location text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_ticket public.tickets%rowtype;
  v_activity public.activities%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.id=auth.uid() and p.status='active'
  ) then
    raise exception 'profile_not_active';
  end if;

  select * into v_ticket from public.tickets where id=p_ticket_id;
  if not found then raise exception 'Solicitud no existe.'; end if;

  if not (
    public.has_permission('schedule.manage')
    or public.can_access_team(v_ticket.assigned_team_code)
    or v_ticket.requester_id=auth.uid()
  ) then
    raise exception 'No tienes permiso para programar esta solicitud.';
  end if;

  insert into public.activities(
    ticket_id,resource_code,title,start_at,end_at,kind,description,location,created_by
  ) values (
    p_ticket_id,p_resource_code,trim(p_title),p_start_at,p_end_at,
    coalesce(nullif(p_kind,''),'support'),
    nullif(trim(coalesce(p_description,'')),''),
    nullif(trim(coalesce(p_location,'')),''),
    auth.uid()
  )
  returning * into v_activity;

  update public.tickets
  set status='scheduled', assigned_resource_code=p_resource_code, updated_at=now()
  where id=p_ticket_id and status not in ('resolved','closed','cancelled');

  return to_jsonb(v_activity);
end;
$function$;

create or replace function public.app_bootstrap()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_profile jsonb;
  v_roles jsonb;
  v_modules jsonb;
  v_services jsonb;
  v_resources jsonb;
  v_status text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  perform public.ensure_launch_profile();

  select to_jsonb(p.*), p.status
    into v_profile, v_status
  from public.profiles p
  where p.id=auth.uid();

  if v_profile is null or v_status <> 'active' then
    return jsonb_build_object(
      'profile',v_profile,
      'roles','[]'::jsonb,
      'modules','[]'::jsonb,
      'services','[]'::jsonb,
      'schedule_resources','[]'::jsonb
    );
  end if;

  perform public.refresh_schedule_resource_names();

  select coalesce(jsonb_agg(jsonb_build_object(
    'code',r.code,'name',r.name,'is_admin',r.is_admin
  ) order by r.code),'[]'::jsonb)
  into v_roles
  from public.profile_roles pr
  join public.roles r on r.code=pr.role_code
  where pr.profile_id=auth.uid();

  select coalesce(jsonb_agg(jsonb_build_object(
    'code',m.code,'label',m.label,'description',m.description,'nav_order',m.nav_order
  ) order by m.nav_order),'[]'::jsonb)
  into v_modules
  from public.modules m
  where m.is_active
    and (m.required_permission is null or public.has_permission(m.required_permission));

  select coalesce(jsonb_agg(to_jsonb(s)
    order by coalesce(s.visual_order,100),s.name),'[]'::jsonb)
  into v_services
  from public.services s
  where s.is_active
    and s.is_requestable
    and (
      public.has_role('super_admin')
      or public.has_role('secretary_admin')
      or public.has_role('requester')
      or public.can_access_team(s.team_code)
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'code',sr.code,
    'name',coalesce(nullif(trim(p.full_name),''),sr.name),
    'role_label',sr.role_label,
    'initials',coalesce(public.profile_initials(p.full_name,p.email),sr.initials),
    'team_code',sr.team_code,
    'profile_id',sr.profile_id,
    'display_order',sr.display_order,
    'is_active',sr.is_active
  ) order by sr.display_order),'[]'::jsonb)
  into v_resources
  from public.schedule_resources sr
  left join public.profiles p on p.id=sr.profile_id
  where sr.is_active;

  return jsonb_build_object(
    'profile',v_profile,
    'roles',v_roles,
    'modules',v_modules,
    'services',v_services,
    'schedule_resources',v_resources
  );
end;
$function$;

create or replace function public.guard_profile_self_sensitive_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is not null and old.id=v_actor then
    if new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.status is distinct from old.status
       or new.created_at is distinct from old.created_at then
      raise exception 'No puedes modificar directamente campos sensibles de tu propia cuenta.';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.guard_profile_self_sensitive_update()
  from public, anon, authenticated;

drop trigger if exists trg_guard_profile_self_sensitive_update on public.profiles;

create trigger trg_guard_profile_self_sensitive_update
before update on public.profiles
for each row
execute function public.guard_profile_self_sensitive_update();

revoke insert, update, delete on public.profiles from anon;
