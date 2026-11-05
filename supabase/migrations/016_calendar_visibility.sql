-- Calendar privacy: company-wide events (holidays, all-hands) are visible to everyone and created by
-- admins; invite-only events (meetings) are visible only to the creator and invited people.
-- Admins do not see other people's private meetings. Safe to run more than once.

begin;

alter table public.workspace_events add column if not exists visibility text not null default 'invite';
do $$ begin
  alter table public.workspace_events add constraint workspace_events_visibility_check check (visibility in ('company', 'invite'));
exception when duplicate_object then null;
end $$;

-- Security definer so event and attendee policies can check each other without recursion.
create or replace function public.can_view_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.workspace_events e
    where e.id = p_event_id
      and (e.visibility = 'company' or e.created_by = auth.uid()
        or exists (select 1 from public.event_attendees a where a.event_id = e.id and a.user_id = auth.uid()))
  );
$$;

create or replace function public.owns_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.workspace_events e where e.id = p_event_id and e.created_by = auth.uid());
$$;

revoke all on function public.can_view_event(uuid) from public, anon;
revoke all on function public.owns_event(uuid) from public, anon;
grant execute on function public.can_view_event(uuid) to authenticated;
grant execute on function public.owns_event(uuid) to authenticated;

-- ── Events ──
drop policy if exists "Authenticated users read events" on public.workspace_events;
drop policy if exists "Users create events" on public.workspace_events;
drop policy if exists "Creators update events" on public.workspace_events;
drop policy if exists "Invited people read events" on public.workspace_events;
-- visibility/created_by are checked directly for insert ... returning (the new row is not yet visible to can_view_event).
create policy "Invited people read events" on public.workspace_events for select to authenticated
  using (visibility = 'company' or created_by = auth.uid() or public.can_view_event(id));
create policy "Users create events" on public.workspace_events for insert to authenticated
  with check (created_by = auth.uid() and (visibility = 'invite' or public.is_workspace_admin()));
create policy "Creators update events" on public.workspace_events for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid() and (visibility = 'invite' or public.is_workspace_admin()));
-- "Creators delete events" from 010 stays.

-- ── Attendees: the creator invites and removes people; each person answers for themselves ──
drop policy if exists "Authenticated users read attendees" on public.event_attendees;
drop policy if exists "Users manage own RSVP" on public.event_attendees;
drop policy if exists "Event members read attendees" on public.event_attendees;
drop policy if exists "Organisers invite people" on public.event_attendees;
drop policy if exists "Organisers remove people" on public.event_attendees;
drop policy if exists "People answer their own invites" on public.event_attendees;
drop policy if exists "People leave events" on public.event_attendees;
create policy "Event members read attendees" on public.event_attendees for select to authenticated
  using (user_id = auth.uid() or public.can_view_event(event_id));
-- Organisers invite anyone; others may only RSVP to company-wide events they can see.
create policy "Organisers invite people" on public.event_attendees for insert to authenticated
  with check (public.owns_event(event_id) or (user_id = auth.uid() and public.can_view_event(event_id)));
create policy "People answer their own invites" on public.event_attendees for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Organisers remove people" on public.event_attendees for delete to authenticated
  using (public.owns_event(event_id) or user_id = auth.uid());

commit;
