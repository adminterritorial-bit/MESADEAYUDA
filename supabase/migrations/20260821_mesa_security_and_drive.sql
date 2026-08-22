create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_read_authenticated on public.app_settings;
create policy app_settings_read_authenticated
on public.app_settings for select to authenticated
using (true);

insert into public.app_settings(key, value)
values (
  'drive_upload_webapp_url',
  'https://script.google.com/macros/s/AKfycbzZKy72_Jpl_uZZ2U1_PoKVRUYM01d7yxfoWOXM0BsulC88DPQTAnxyhwwyfRV0ipuRrA/exec'
)
on conflict (key) do update set value = excluded.value, updated_at = now();

drop policy if exists activities_update_owner_or_admin on public.activities;
create policy activities_update_owner_or_admin
on public.activities for update to authenticated
using (
  created_by = auth.uid()
  or public.is_admin()
)
with check (
  created_by = auth.uid()
  or public.is_admin()
);

revoke all on function public.admin_upsert_profile(uuid,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.admin_upsert_profile(uuid,text,text,text,text,uuid) to service_role;

revoke all on function public.has_permission_for_user(uuid,text) from public, anon, authenticated;
grant execute on function public.has_permission_for_user(uuid,text) to service_role;
