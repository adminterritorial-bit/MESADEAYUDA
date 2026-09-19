-- Segunda barrera de autorización para adjuntos.
-- Impide que service_role pueda registrar relaciones ticket/mensaje/actividad
-- incompatibles con el usuario indicado en uploaded_by.

create or replace function public.guard_ticket_attachment_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_is_admin boolean := false;
  v_requester uuid;
  v_team text;
  v_message_ticket uuid;
  v_message_author uuid;
  v_activity_ticket uuid;
  v_activity_creator uuid;
begin
  if new.uploaded_by is null then
    raise exception 'El adjunto requiere uploaded_by.';
  end if;

  if new.ticket_id is null and new.message_id is null and new.activity_id is null then
    raise exception 'El adjunto debe estar asociado a ticket, mensaje o actividad.';
  end if;

  select exists (
    select 1
    from public.profile_roles pr
    where pr.profile_id = new.uploaded_by
      and pr.role_code in ('super_admin','secretary_admin','tic_admin')
  ) into v_is_admin;

  if new.ticket_id is not null then
    select t.requester_id, t.assigned_team_code
      into v_requester, v_team
    from public.tickets t
    where t.id = new.ticket_id;

    if not found then
      raise exception 'Ticket de adjunto inexistente.';
    end if;

    if not (
      v_is_admin
      or v_requester = new.uploaded_by
      or exists (
        select 1
        from public.profile_teams pt
        where pt.profile_id = new.uploaded_by
          and pt.team_code = v_team
      )
    ) then
      raise exception 'El usuario no tiene permiso para adjuntar archivos a este ticket.';
    end if;
  end if;

  if new.message_id is not null then
    select m.ticket_id, m.author_id
      into v_message_ticket, v_message_author
    from public.ticket_messages m
    where m.id = new.message_id;

    if not found then
      raise exception 'Mensaje de adjunto inexistente.';
    end if;

    if new.ticket_id is not null and v_message_ticket is distinct from new.ticket_id then
      raise exception 'El mensaje no pertenece al ticket indicado.';
    end if;

    if not (v_is_admin or v_message_author = new.uploaded_by) then
      raise exception 'El usuario no puede adjuntar archivos a este mensaje.';
    end if;

    if v_message_ticket is not null and new.ticket_id is null then
      select t.requester_id, t.assigned_team_code
        into v_requester, v_team
      from public.tickets t
      where t.id = v_message_ticket;

      if not (
        v_is_admin
        or v_requester = new.uploaded_by
        or exists (
          select 1
          from public.profile_teams pt
          where pt.profile_id = new.uploaded_by
            and pt.team_code = v_team
        )
      ) then
        raise exception 'El usuario no tiene acceso al ticket del mensaje.';
      end if;
    end if;
  end if;

  if new.activity_id is not null then
    select a.ticket_id, a.created_by
      into v_activity_ticket, v_activity_creator
    from public.activities a
    where a.id = new.activity_id;

    if not found then
      raise exception 'Actividad de adjunto inexistente.';
    end if;

    if new.ticket_id is not null
       and v_activity_ticket is not null
       and v_activity_ticket is distinct from new.ticket_id then
      raise exception 'La actividad no pertenece al ticket indicado.';
    end if;

    if not (v_is_admin or v_activity_creator = new.uploaded_by) then
      raise exception 'El usuario no puede adjuntar archivos a esta actividad.';
    end if;

    if v_activity_ticket is not null and new.ticket_id is null then
      select t.requester_id, t.assigned_team_code
        into v_requester, v_team
      from public.tickets t
      where t.id = v_activity_ticket;

      if not (
        v_is_admin
        or v_requester = new.uploaded_by
        or exists (
          select 1
          from public.profile_teams pt
          where pt.profile_id = new.uploaded_by
            and pt.team_code = v_team
        )
      ) then
        raise exception 'El usuario no tiene acceso al ticket de la actividad.';
      end if;
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_ticket_attachment_context()
  from public, anon, authenticated;

drop trigger if exists trg_guard_ticket_attachment_context
  on public.ticket_attachments;

create trigger trg_guard_ticket_attachment_context
before insert or update of ticket_id, message_id, activity_id, uploaded_by
on public.ticket_attachments
for each row
execute function public.guard_ticket_attachment_context();
