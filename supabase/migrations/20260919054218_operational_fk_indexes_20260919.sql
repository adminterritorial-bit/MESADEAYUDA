-- Índices operativos priorizados. Se evitan índices indiscriminados en tablas catálogo pequeñas.

create index if not exists idx_tickets_requester_created
  on public.tickets(requester_id, created_at desc);

create index if not exists idx_tickets_service_id
  on public.tickets(service_id);

create index if not exists idx_tickets_team_created
  on public.tickets(assigned_team_code, created_at desc);

create index if not exists idx_ticket_messages_ticket_created
  on public.ticket_messages(ticket_id, created_at);

create index if not exists idx_ticket_messages_author
  on public.ticket_messages(author_id);

create index if not exists idx_activities_ticket_start
  on public.activities(ticket_id, start_at);

create index if not exists idx_activities_created_by
  on public.activities(created_by);

create index if not exists idx_schedule_resources_profile
  on public.schedule_resources(profile_id);

create index if not exists idx_schedule_resources_team
  on public.schedule_resources(team_code);

create index if not exists idx_services_team
  on public.services(team_code);

create index if not exists idx_profile_roles_role
  on public.profile_roles(role_code);

create index if not exists idx_profile_teams_team
  on public.profile_teams(team_code);

create index if not exists idx_notification_delivery_notification
  on public.notification_delivery_queue(notification_id);

create index if not exists idx_notification_delivery_ticket
  on public.notification_delivery_queue(ticket_id);

create index if not exists idx_assets_assigned_profile
  on public.assets(assigned_profile_id);

create index if not exists idx_institutional_emails_profile
  on public.institutional_emails(profile_id);

create index if not exists idx_import_jobs_created_by
  on public.import_jobs(created_by);

create index if not exists idx_app_settings_updated_by
  on public.app_settings(updated_by);
