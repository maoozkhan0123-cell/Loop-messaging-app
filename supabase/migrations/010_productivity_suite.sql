-- BySync productivity suite: durable drafts, scheduling, inbox, events and task details.
-- Safe to run after migrations 001-009.

create table if not exists public.saved_messages (
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create table if not exists public.message_drafts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  parent_id uuid references public.messages(id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now()
);
create unique index if not exists message_drafts_root_key on public.message_drafts(user_id, channel_id) where parent_id is null;
create unique index if not exists message_drafts_thread_key on public.message_drafts(user_id, channel_id, parent_id) where parent_id is not null;

create table if not exists public.scheduled_messages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  parent_id uuid references public.messages(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sent','cancelled','failed')),
  sent_message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_events (
  id uuid primary key default uuid_generate_v4(),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  meeting_url text,
  recurrence text not null default 'none' check (recurrence in ('none','daily','weekly','monthly')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.event_attendees (
  event_id uuid not null references public.workspace_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  response text not null default 'pending' check (response in ('pending','accepted','declined','maybe')),
  primary key (event_id, user_id)
);

create table if not exists public.user_workspace_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  dashboard_widgets jsonb not null default '["tasks","calendar","messages","team"]'::jsonb,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'UTC',
  updated_at timestamptz not null default now()
);

create table if not exists public.project_task_checklist (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 500),
  completed boolean not null default false,
  position integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_task_watchers (
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index if not exists scheduled_messages_due_idx on public.scheduled_messages(status, scheduled_for);
create index if not exists workspace_events_starts_idx on public.workspace_events(starts_at);
create index if not exists task_checklist_task_idx on public.project_task_checklist(task_id, position);

alter table public.saved_messages enable row level security;
alter table public.message_drafts enable row level security;
alter table public.scheduled_messages enable row level security;
alter table public.workspace_events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.user_workspace_preferences enable row level security;
alter table public.project_task_checklist enable row level security;
alter table public.project_task_watchers enable row level security;

create policy "Users manage own saved messages" on public.saved_messages for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage own drafts" on public.message_drafts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage own scheduled messages" on public.scheduled_messages for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Authenticated users read events" on public.workspace_events for select to authenticated using (true);
create policy "Users create events" on public.workspace_events for insert to authenticated with check (created_by = auth.uid());
create policy "Creators update events" on public.workspace_events for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "Creators delete events" on public.workspace_events for delete to authenticated using (created_by = auth.uid());
create policy "Authenticated users read attendees" on public.event_attendees for select to authenticated using (true);
create policy "Users manage own RSVP" on public.event_attendees for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage own workspace preferences" on public.user_workspace_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Authenticated users read task checklist" on public.project_task_checklist for select to authenticated using (true);
create policy "Authenticated users create task checklist" on public.project_task_checklist for insert to authenticated with check (created_by = auth.uid());
create policy "Authenticated users update task checklist" on public.project_task_checklist for update to authenticated using (true) with check (true);
create policy "Authenticated users delete task checklist" on public.project_task_checklist for delete to authenticated using (true);
create policy "Authenticated users read task watchers" on public.project_task_watchers for select to authenticated using (true);
create policy "Users manage own task watches" on public.project_task_watchers for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A backend worker can call this RPC every minute. It is intentionally service-role only.
create or replace function public.deliver_scheduled_messages()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare item record; delivered integer := 0; new_id uuid;
begin
  for item in select * from public.scheduled_messages
    where status = 'pending' and scheduled_for <= now() order by scheduled_for for update skip locked
  loop
    insert into public.messages(channel_id, user_id, body, parent_id)
    values(item.channel_id, item.user_id, item.body, item.parent_id) returning id into new_id;
    update public.scheduled_messages set status='sent', sent_message_id=new_id, updated_at=now() where id=item.id;
    delivered := delivered + 1;
  end loop;
  return delivered;
end $$;
revoke all on function public.deliver_scheduled_messages() from public, anon, authenticated;
grant execute on function public.deliver_scheduled_messages() to service_role;
