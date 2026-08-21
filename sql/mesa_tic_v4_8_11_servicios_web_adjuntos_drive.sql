-- Mesa de Ayuda TIC v4.8.11
-- Servicios web + adjuntos en Google Drive con registro de ruta en Supabase.
-- Ejecutar después de v4.8.10.

begin;

-- 1) Catálogo: publicación en página web y solicitud de desarrollo web.
alter table public.services add column if not exists category text;
alter table public.services add column if not exists icon_key text;
alter table public.services add column if not exists visual_order int not null default 100;

insert into public.services(code,name,description,team_code,is_requestable,is_active,category,icon_key,visual_order) values
('web_publication','Publicación en página web','Solicitud para publicar noticias, decretos, comunicados, documentos, enlaces, actos administrativos o información institucional en la página web oficial.','COM',true,true,'Publicación y contenidos','dashboard-analytics',108),
('web_development_request','Solicitud de desarrollo web','Solicitud para crear, ajustar o mejorar módulos, micrositios, formularios, componentes, páginas internas o funcionalidades web institucionales.','TIC',true,true,'Desarrollo web y plataformas','workflow-settings',58)
on conflict(code) do update set
  name=excluded.name,
  description=excluded.description,
  team_code=excluded.team_code,
  is_requestable=true,
  is_active=true,
  category=excluded.category,
  icon_key=excluded.icon_key,
  visual_order=excluded.visual_order,
  updated_at=now();

-- Ajustar nombre visible si existía con otro texto.
update public.services
set name='Publicación en página web',
    description='Solicitud para publicar noticias, decretos, comunicados, documentos, enlaces, actos administrativos o información institucional en la página web oficial.',
    category='Publicación y contenidos',
    icon_key='dashboard-analytics',
    visual_order=108,
    is_requestable=true,
    is_active=true,
    updated_at=now()
where code='web_publication';

-- 2) Tabla única de adjuntos. El archivo vive en Google Drive; Supabase guarda ruta y metadatos.
create table if not exists public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets(id) on delete cascade,
  message_id uuid references public.ticket_messages(id) on delete set null,
  activity_id uuid references public.activities(id) on delete set null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  source text not null default 'google_drive' check (source in ('google_drive','external_link')),
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  drive_file_id text,
  drive_url text,
  drive_download_url text,
  drive_folder_id text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ticket_attachments_ticket_idx on public.ticket_attachments(ticket_id, created_at desc);
create index if not exists ticket_attachments_message_idx on public.ticket_attachments(message_id);
create index if not exists ticket_attachments_activity_idx on public.ticket_attachments(activity_id);
create index if not exists ticket_attachments_uploaded_by_idx on public.ticket_attachments(uploaded_by, created_at desc);
create index if not exists ticket_attachments_drive_file_idx on public.ticket_attachments(drive_file_id);

alter table public.ticket_attachments enable row level security;

drop policy if exists ticket_attachments_select_scoped on public.ticket_attachments;
drop policy if exists ticket_attachments_insert_scoped on public.ticket_attachments;
drop policy if exists ticket_attachments_update_admin on public.ticket_attachments;
drop policy if exists ticket_attachments_delete_admin on public.ticket_attachments;

create policy ticket_attachments_select_scoped
on public.ticket_attachments
for select to authenticated
using (
  public.is_admin()
  or uploaded_by = auth.uid()
  or exists (
    select 1
    from public.tickets t
    where t.id = ticket_attachments.ticket_id
      and (t.requester_id = auth.uid() or public.can_access_team(t.assigned_team_code))
  )
  or (
    ticket_id is null and uploaded_by = auth.uid()
  )
);

-- Inserción directa queda permitida para el usuario autenticado, pero el flujo recomendado es Apps Script
-- con service_role para validar sesión y guardar la ruta después de subir a Drive.
create policy ticket_attachments_insert_scoped
on public.ticket_attachments
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and (
    ticket_id is null
    or exists (
      select 1
      from public.tickets t
      where t.id = ticket_attachments.ticket_id
        and (t.requester_id = auth.uid() or public.can_access_team(t.assigned_team_code))
    )
  )
);

create policy ticket_attachments_update_admin
on public.ticket_attachments
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy ticket_attachments_delete_admin
on public.ticket_attachments
for delete to authenticated
using (public.is_admin());

grant select, insert on public.ticket_attachments to authenticated;

-- 3) Vista opcional para auditoría administrativa.
create or replace view public.ticket_attachments_secure with (security_invoker=true) as
select
  a.id,
  a.ticket_id,
  t.ticket_number,
  t.title as ticket_title,
  a.message_id,
  a.activity_id,
  a.uploaded_by,
  p.full_name as uploaded_by_name,
  p.email as uploaded_by_email,
  a.source,
  a.file_name,
  a.mime_type,
  a.size_bytes,
  a.drive_file_id,
  a.drive_url,
  a.drive_download_url,
  a.drive_folder_id,
  a.description,
  a.metadata,
  a.created_at
from public.ticket_attachments a
left join public.tickets t on t.id = a.ticket_id
left join public.profiles p on p.id = a.uploaded_by;

grant select on public.ticket_attachments_secure to authenticated;

commit;

select 'OK Mesa TIC v4.8.11: servicios web y adjuntos Drive configurados' as resultado;
