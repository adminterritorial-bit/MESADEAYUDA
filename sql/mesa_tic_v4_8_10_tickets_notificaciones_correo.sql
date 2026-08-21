-- Mesa de Ayuda TIC v4.8.10
-- Tickets completos + notificaciones internas + correo Apps Script
-- Ejecutar en Supabase SQL Editor.

begin;

-- 1) Refuerzos de columnas para tickets operativos.
alter table public.tickets
  add column if not exists assigned_resource_code text references public.schedule_resources(code),
  add column if not exists work_mode text,
  add column if not exists estimated_minutes int,
  add column if not exists estimated_due_at timestamptz,
  add column if not exists workload_score int not null default 0,
  add column if not exists workload_warning text,
  add column if not exists requires_schedule boolean not null default false,
  add column if not exists resolved_at timestamptz,
  add column if not exists closed_at timestamptz;

alter table public.tickets drop constraint if exists tickets_work_mode_check;
alter table public.tickets
  add constraint tickets_work_mode_check
  check (work_mode is null or work_mode in ('presencial','virtual','mixto','mixta','remote','onsite','hybrid'));

create index if not exists idx_tickets_assigned_resource on public.tickets(assigned_resource_code);
create index if not exists idx_tickets_work_mode on public.tickets(work_mode);
create index if not exists idx_tickets_status_created on public.tickets(status, created_at desc);

-- 2) Notificaciones internas más completas.
alter table public.notifications
  add column if not exists ticket_id uuid references public.tickets(id) on delete cascade,
  add column if not exists event_type text,
  add column if not exists severity text not null default 'info',
  add column if not exists channel text not null default 'internal',
  add column if not exists action_url text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists delivered_at timestamptz;

create index if not exists notifications_profile_created_idx on public.notifications(profile_id, created_at desc);
create index if not exists notifications_profile_unread_idx on public.notifications(profile_id, created_at desc) where read_at is null;
create index if not exists notifications_ticket_idx on public.notifications(ticket_id, created_at desc);
create index if not exists notifications_event_type_idx on public.notifications(event_type, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_own on public.notifications;
drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists notifications_admin_write on public.notifications;

create policy notifications_select_own
on public.notifications
for select to authenticated
using (profile_id = auth.uid() or public.is_admin());

create policy notifications_update_own
on public.notifications
for update to authenticated
using (profile_id = auth.uid() or public.is_admin())
with check (profile_id = auth.uid() or public.is_admin());

create policy notifications_admin_write
on public.notifications
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- 3) Cola externa de correo/SMS/WhatsApp. Por ahora se usa email con Google Apps Script.
create table if not exists public.notification_delivery_queue (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notifications(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete cascade,
  channel text not null check (channel in ('email','sms','whatsapp')),
  destination text,
  status text not null default 'pending' check (status in ('pending','sent','failed','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text
);

alter table public.notification_delivery_queue
  add column if not exists attempts integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists provider text not null default 'google_apps_script',
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists processed_by text;

create index if not exists notification_delivery_queue_status_idx on public.notification_delivery_queue(status, created_at);
create index if not exists notification_delivery_queue_profile_idx on public.notification_delivery_queue(profile_id, created_at desc);
create index if not exists notification_delivery_queue_channel_status_idx on public.notification_delivery_queue(channel, status, created_at);
create index if not exists notification_delivery_queue_ticket_idx on public.notification_delivery_queue(ticket_id, created_at desc);

alter table public.notification_delivery_queue enable row level security;

drop policy if exists notification_delivery_admin_select on public.notification_delivery_queue;
drop policy if exists notification_delivery_admin_write on public.notification_delivery_queue;

create policy notification_delivery_admin_select
on public.notification_delivery_queue
for select to authenticated
using (public.is_admin());

create policy notification_delivery_admin_write
on public.notification_delivery_queue
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- 4) Marcas de tiempo coherentes para resolución/cierre.
create or replace function public.set_ticket_status_timestamps()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'resolved' then
      new.resolved_at = coalesce(new.resolved_at, now());
    elsif new.status = 'closed' then
      new.resolved_at = coalesce(new.resolved_at, now());
      new.closed_at = coalesce(new.closed_at, now());
    elsif new.status in ('new','assigned','in_progress','waiting_user','scheduled') then
      new.closed_at = null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ticket_status_timestamps on public.tickets;

create trigger trg_ticket_status_timestamps
before update of status on public.tickets
for each row
execute function public.set_ticket_status_timestamps();

-- 5) Trigger central de seguimiento.
-- Correo externo: solo al radicar y al cerrar.
-- Interno: radicación y todos los cambios de estado.
create or replace function public.notify_ticket_tracking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
  v_title text;
  v_body text;
  v_severity text := 'info';
  v_notification_id uuid;

  v_requester_email text;
  v_requester_name text;
  v_service_name text;
  v_resource_name text;
  v_assigned_profile_id uuid;
  v_status_label text;
  v_send_email boolean := false;
  v_work_mode text;
begin
  select s.name
  into v_service_name
  from public.services s
  where s.id = new.service_id;

  select p.email, p.full_name
  into v_requester_email, v_requester_name
  from public.profiles p
  where p.id = new.requester_id;

  select sr.name, sr.profile_id
  into v_resource_name, v_assigned_profile_id
  from public.schedule_resources sr
  where sr.code = new.assigned_resource_code;

  v_status_label := case new.status
    when 'new' then 'Nueva'
    when 'assigned' then 'Asignada'
    when 'in_progress' then 'En gestión'
    when 'waiting_user' then 'Esperando información'
    when 'scheduled' then 'Programada'
    when 'resolved' then 'Resuelta'
    when 'closed' then 'Cerrada'
    when 'cancelled' then 'Cancelada'
    else coalesce(new.status, '')
  end;

  v_work_mode := coalesce(nullif(new.work_mode,''), nullif(new.payload->>'work_mode',''), nullif(new.payload->>'mode',''));

  if tg_op = 'INSERT' then
    v_event_type := 'ticket.created';
    v_title := 'Solicitud radicada · ' || coalesce(new.ticket_number, '');
    v_body := 'Tu solicitud fue radicada correctamente en la Mesa de Ayuda TIC. El caso quedó registrado y en seguimiento.';
    v_severity := 'success';
    v_send_email := true;

  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_event_type := 'ticket.' || coalesce(new.status, 'updated');
    v_title := 'Solicitud ' || lower(v_status_label) || ' · ' || coalesce(new.ticket_number, '');

    v_body := case new.status
      when 'resolved' then 'Tu solicitud fue marcada como resuelta. Revisa la respuesta registrada por el equipo.'
      when 'closed' then 'Tu solicitud fue cerrada. El caso queda finalizado con trazabilidad en la Mesa de Ayuda TIC.'
      when 'waiting_user' then 'El equipo necesita información adicional para continuar con tu solicitud.'
      when 'scheduled' then 'Tu solicitud fue programada en el cronograma.'
      when 'in_progress' then 'Tu solicitud está en gestión por el equipo responsable.'
      when 'cancelled' then 'Tu solicitud fue cancelada. Revisa el detalle del caso.'
      else 'Tu solicitud cambió de estado a: ' || v_status_label || '.'
    end;

    v_severity := case new.status
      when 'resolved' then 'success'
      when 'closed' then 'success'
      when 'waiting_user' then 'warning'
      when 'cancelled' then 'warning'
      else 'info'
    end;

    v_send_email := new.status = 'closed';
  else
    return new;
  end if;

  if new.requester_id is not null then
    insert into public.notifications(
      profile_id,
      ticket_id,
      event_type,
      severity,
      channel,
      title,
      body,
      action_url,
      metadata
    )
    values(
      new.requester_id,
      new.id,
      v_event_type,
      v_severity,
      'internal',
      v_title,
      v_body,
      '/?ticket_id=' || new.id,
      jsonb_build_object(
        'ticket_id', new.id,
        'ticket_number', new.ticket_number,
        'ticket_title', new.title,
        'ticket_description', new.description,
        'service_name', coalesce(v_service_name, ''),
        'status', new.status,
        'status_label', v_status_label,
        'priority', new.priority,
        'preferred_date', new.preferred_date,
        'assigned_team_code', new.assigned_team_code,
        'assigned_resource_code', new.assigned_resource_code,
        'assigned_resource_name', coalesce(v_resource_name, ''),
        'work_mode', coalesce(v_work_mode,''),
        'created_at', new.created_at,
        'closed_at', new.closed_at,
        'resolved_at', new.resolved_at
      )
    )
    returning id into v_notification_id;

    if v_send_email and coalesce(v_requester_email, '') <> '' then
      insert into public.notification_delivery_queue(
        notification_id,
        profile_id,
        ticket_id,
        channel,
        destination,
        status,
        provider,
        payload
      )
      values(
        v_notification_id,
        new.requester_id,
        new.id,
        'email',
        v_requester_email,
        'pending',
        'google_apps_script',
        jsonb_build_object(
          'event_type', v_event_type,
          'subject', v_title,
          'body', v_body,
          'requester_name', coalesce(v_requester_name, ''),
          'requester_email', coalesce(v_requester_email, ''),
          'ticket_id', new.id,
          'ticket_number', new.ticket_number,
          'ticket_title', new.title,
          'ticket_description', new.description,
          'service_name', coalesce(v_service_name, ''),
          'status', new.status,
          'status_label', v_status_label,
          'priority', new.priority,
          'preferred_date', new.preferred_date,
          'assigned_team_code', new.assigned_team_code,
          'assigned_resource_code', new.assigned_resource_code,
          'assigned_resource_name', coalesce(v_resource_name, ''),
          'work_mode', coalesce(v_work_mode, ''),
          'channel_requested', coalesce(new.payload->>'channel', ''),
          'place', coalesce(new.payload->>'place', ''),
          'contact', coalesce(new.payload->>'contact', ''),
          'attachments_note', coalesce(new.payload->>'attachments_note', ''),
          'created_at', new.created_at,
          'closed_at', new.closed_at,
          'resolved_at', new.resolved_at,
          'action_path', '/?ticket_id=' || new.id
        )
      );
    end if;
  end if;

  -- Aviso interno para el responsable real del cronograma, si está asociado a un usuario.
  if v_assigned_profile_id is not null
     and v_assigned_profile_id is distinct from new.requester_id then
    insert into public.notifications(
      profile_id,
      ticket_id,
      event_type,
      severity,
      channel,
      title,
      body,
      action_url,
      metadata
    )
    values(
      v_assigned_profile_id,
      new.id,
      v_event_type || '.assigned_resource',
      v_severity,
      'internal',
      'Seguimiento asignado · ' || coalesce(new.ticket_number, ''),
      'La solicitud asignada a tu agenda cambió de estado: ' || v_status_label || '.',
      '/?ticket_id=' || new.id,
      jsonb_build_object(
        'ticket_id', new.id,
        'ticket_number', new.ticket_number,
        'service_name', coalesce(v_service_name, ''),
        'status', new.status,
        'status_label', v_status_label,
        'assigned_team_code', new.assigned_team_code
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_ticket_tracking on public.tickets;

create trigger trg_notify_ticket_tracking
after insert or update of status on public.tickets
for each row
execute function public.notify_ticket_tracking();

commit;

select 'OK Mesa TIC v4.8.10: tickets, notificaciones internas y correos de radicación/cierre configurados' as resultado;
