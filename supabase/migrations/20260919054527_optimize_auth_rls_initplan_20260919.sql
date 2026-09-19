-- Optimiza policies RLS para que auth.uid() se evalúe una vez por consulta.
-- No cambia la lógica de autorización.

alter policy "activities_insert_all_authenticated"
on public.activities
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.schedule_resources sr
    where sr.code = activities.resource_code
      and sr.is_active
  )
);

alter policy "activities_update_owner_or_admin"
on public.activities
using (
  created_by = (select auth.uid())
  or public.is_admin()
)
with check (
  created_by = (select auth.uid())
  or public.is_admin()
);

alter policy "notifications_select_own"
on public.notifications
using (
  profile_id = (select auth.uid())
  or public.is_admin()
);

alter policy "notifications_update_own"
on public.notifications
using (
  profile_id = (select auth.uid())
  or public.is_admin()
)
with check (
  profile_id = (select auth.uid())
  or public.is_admin()
);

alter policy "profile_roles_select"
on public.profile_roles
using (
  profile_id = (select auth.uid())
  or public.is_admin()
);

alter policy "profile_teams_select"
on public.profile_teams
using (
  profile_id = (select auth.uid())
  or public.is_admin()
);

alter policy "profiles_select"
on public.profiles
using (
  id = (select auth.uid())
  or public.is_admin()
);

alter policy "profiles_update_self"
on public.profiles
using (
  id = (select auth.uid())
  or public.has_permission('users.manage')
)
with check (
  id = (select auth.uid())
  or public.has_permission('users.manage')
);

alter policy "ticket_attachments_insert_scoped"
on public.ticket_attachments
with check (
  uploaded_by = (select auth.uid())
  and (
    ticket_id is null
    or exists (
      select 1
      from public.tickets t
      where t.id = ticket_attachments.ticket_id
        and (
          t.requester_id = (select auth.uid())
          or public.can_access_team(t.assigned_team_code)
        )
    )
  )
);

alter policy "ticket_attachments_select_scoped"
on public.ticket_attachments
using (
  public.is_admin()
  or uploaded_by = (select auth.uid())
  or exists (
    select 1
    from public.tickets t
    where t.id = ticket_attachments.ticket_id
      and (
        t.requester_id = (select auth.uid())
        or public.can_access_team(t.assigned_team_code)
      )
  )
  or (
    ticket_id is null
    and uploaded_by = (select auth.uid())
  )
);

alter policy "ticket_messages_insert_scoped"
on public.ticket_messages
with check (
  author_id = (select auth.uid())
  and exists (
    select 1
    from public.tickets t
    where t.id = ticket_messages.ticket_id
      and (
        t.requester_id = (select auth.uid())
        or public.can_access_team(t.assigned_team_code)
      )
  )
);

alter policy "ticket_messages_select_scoped"
on public.ticket_messages
using (
  exists (
    select 1
    from public.tickets t
    where t.id = ticket_messages.ticket_id
      and (
        t.requester_id = (select auth.uid())
        or public.can_access_team(t.assigned_team_code)
      )
  )
  and (
    visibility = 'public'
    or public.has_permission('request.manage')
  )
);

alter policy "tickets_insert_function"
on public.tickets
with check (
  requester_id = (select auth.uid())
);

alter policy "tickets_select_scoped"
on public.tickets
using (
  requester_id = (select auth.uid())
  or public.can_access_team(assigned_team_code)
);

alter policy "user_tutorial_status_insert_own"
on public.user_tutorial_status
with check (
  profile_id = (select auth.uid())
);

alter policy "user_tutorial_status_select_own"
on public.user_tutorial_status
using (
  profile_id = (select auth.uid())
);

alter policy "user_tutorial_status_update_own"
on public.user_tutorial_status
using (
  profile_id = (select auth.uid())
)
with check (
  profile_id = (select auth.uid())
);
