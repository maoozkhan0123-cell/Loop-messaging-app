-- ============================================================
-- FULL COMBINED SUPABASE SCHEMA FOR LOOP MESSAGING APP
-- Run this script in the Supabase SQL Editor for your new database.
-- ============================================================

-- 1. Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ============================================================
-- 2. TABLES & INDEXES
-- ============================================================

-- PROFILES TABLE
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'User',
  email text not null default '',
  avatar_url text,
  job_title text,
  status text not null default 'offline' check (status in ('online', 'away', 'offline')),
  created_at timestamptz not null default now()
);

-- CHANNELS TABLE
create table if not exists channels (
  id uuid primary key default uuid_generate_v4(),
  type text not null default 'public' check (type in ('public', 'private', 'dm', 'group_dm')),
  name text,
  topic text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists channels_type_idx on channels(type);
create index if not exists channels_created_by_idx on channels(created_by);

-- CHANNEL MEMBERS TABLE
create table if not exists channel_members (
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  last_read_at timestamptz not null default now(),
  notification_pref text not null default 'all' check (notification_pref in ('all', 'mentions', 'none')),
  joined_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create index if not exists channel_members_user_idx on channel_members(user_id);
create index if not exists channel_members_channel_idx on channel_members(channel_id);

-- MESSAGES TABLE
create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  parent_id uuid references messages(id) on delete cascade,
  body text,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_channel_id_idx on messages(channel_id, created_at desc);
create index if not exists messages_parent_id_idx on messages(parent_id);
create index if not exists messages_user_id_idx on messages(user_id);
create index if not exists messages_body_trgm_idx on messages using gin(body gin_trgm_ops);

-- REACTIONS TABLE
create table if not exists reactions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists reactions_message_idx on reactions(message_id);

-- ATTACHMENTS TABLE
create table if not exists attachments (
  id uuid primary key default uuid_generate_v4(),
  message_id uuid not null references messages(id) on delete cascade,
  uploader_id uuid references profiles(id) on delete set null,
  object_key text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists attachments_message_idx on attachments(message_id);

-- ============================================================
-- 3. AUTOMATIC PROFILE CREATION TRIGGER
-- ============================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_pub_channel record;
begin
  -- 1. Create Profile row for the new user in public.profiles
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;

  -- 2. Automatically join the new user to all existing public channels
  for v_pub_channel in
    select id from public.channels where type = 'public' and archived_at is null
  loop
    insert into public.channel_members (channel_id, user_id, role, last_read_at, notification_pref)
    values (v_pub_channel.id, new.id, 'member', now(), 'all')
    on conflict (channel_id, user_id) do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- 4. HELPER & RPC FUNCTIONS
-- ============================================================

-- Function to get user's channel IDs (bypasses recursion in RLS)
create or replace function get_my_channel_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select channel_id from channel_members where user_id = auth.uid();
$$;

-- Create Channel RPC
create or replace function create_channel(p_name text, p_type text default 'public', p_topic text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_id uuid;
begin
  insert into channels (type, name, topic, created_by)
  values (p_type, p_name, p_topic, auth.uid())
  returning id into v_channel_id;

  insert into channel_members (channel_id, user_id, role, last_read_at, notification_pref)
  values (v_channel_id, auth.uid(), 'owner', now(), 'all');

  return v_channel_id;
end;
$$;

-- Create DM Channel RPC
create or replace function create_dm_channel(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_id uuid;
begin
  select cm1.channel_id into v_channel_id
  from channel_members cm1
  join channel_members cm2 on cm2.channel_id = cm1.channel_id
  join channels c on c.id = cm1.channel_id
  where cm1.user_id = auth.uid()
    and cm2.user_id = target_user_id
    and c.type = 'dm'
  limit 1;

  if v_channel_id is not null then
    return v_channel_id;
  end if;

  insert into channels (type, name, created_by)
  values ('dm', null, auth.uid())
  returning id into v_channel_id;

  insert into channel_members (channel_id, user_id, role, last_read_at, notification_pref)
  values
    (v_channel_id, auth.uid(),      'member', now(), 'all'),
    (v_channel_id, target_user_id,  'member', now(), 'all');

  return v_channel_id;
end;
$$;

-- Send Message RPC
create or replace function send_message(
  p_channel_id uuid,
  p_body       text,
  p_parent_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from channel_members
    where channel_id = p_channel_id and user_id = auth.uid()
  ) then
    raise exception 'Not a member of this channel';
  end if;

  insert into messages (channel_id, user_id, body, parent_id)
  values (p_channel_id, auth.uid(), trim(p_body), p_parent_id)
  returning id into v_id;

  update channel_members
  set last_read_at = now()
  where channel_id = p_channel_id and user_id = auth.uid();

  return v_id;
end;
$$;

-- Edit Message RPC
create or replace function edit_message(p_message_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update messages
  set body = trim(p_body), edited_at = now()
  where id = p_message_id and user_id = auth.uid() and deleted_at is null;

  if not found then
    raise exception 'Message not found or not authorized';
  end if;
end;
$$;

-- Delete Message RPC
create or replace function delete_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update messages
  set deleted_at = now()
  where id = p_message_id and user_id = auth.uid();

  if not found then
    raise exception 'Message not found or not authorized';
  end if;
end;
$$;

-- Toggle Reaction RPC
create or replace function toggle_reaction(p_message_id uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_id uuid;
begin
  select channel_id into v_channel_id from messages where id = p_message_id;

  if not exists (
    select 1 from channel_members
    where channel_id = v_channel_id and user_id = auth.uid()
  ) then
    raise exception 'Not a member of this channel';
  end if;

  if exists (
    select 1 from reactions
    where message_id = p_message_id and user_id = auth.uid() and emoji = p_emoji
  ) then
    delete from reactions
    where message_id = p_message_id and user_id = auth.uid() and emoji = p_emoji;
  else
    insert into reactions (message_id, user_id, emoji)
    values (p_message_id, auth.uid(), p_emoji);
  end if;
end;
$$;

-- ============================================================
-- 5. FUNCTION GRANTS & PERMISSIONS
-- ============================================================
grant execute on function send_message(uuid, text, uuid) to authenticated;
grant execute on function edit_message(uuid, text) to authenticated;
grant execute on function delete_message(uuid) to authenticated;
grant execute on function toggle_reaction(uuid, text) to authenticated;
grant execute on function create_channel(text, text, text) to authenticated;
grant execute on function create_dm_channel(uuid) to authenticated;
grant execute on function get_my_channel_ids() to authenticated, anon;

-- ============================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================
alter table profiles enable row level security;
alter table channels enable row level security;
alter table channel_members enable row level security;
alter table messages enable row level security;
alter table reactions enable row level security;
alter table attachments enable row level security;

-- PROFILES
drop policy if exists "Anyone can read profiles" on profiles;
create policy "Anyone can read profiles" on profiles for select using (true);

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Service role can insert profiles" on profiles;
create policy "Service role can insert profiles" on profiles for insert with check (true);

-- CHANNELS
drop policy if exists "Members can read their channels" on channels;
create policy "Members can read their channels" on channels for select using (
  exists (
    select 1 from channel_members
    where channel_id = channels.id and user_id = auth.uid()
  )
);

drop policy if exists "Authenticated users can create channels" on channels;
create policy "Authenticated users can create channels" on channels for insert with check (auth.uid() is not null);

drop policy if exists "Channel owners/admins can update channels" on channels;
create policy "Channel owners/admins can update channels" on channels for update using (
  exists (
    select 1 from channel_members
    where channel_id = channels.id and user_id = auth.uid() and role in ('owner', 'admin')
  )
);

-- CHANNEL MEMBERS
drop policy if exists "Members can view channel memberships" on channel_members;
create policy "Members can view channel memberships" on channel_members for select using (
  user_id = auth.uid() or channel_id = any(array(select get_my_channel_ids()))
);

drop policy if exists "Authenticated users can join public channels" on channel_members;
create policy "Authenticated users can join public channels" on channel_members for insert with check (auth.uid() is not null);

drop policy if exists "Members can update their own membership" on channel_members;
create policy "Members can update their own membership" on channel_members for update using (user_id = auth.uid());

-- MESSAGES
drop policy if exists "Channel members can read messages" on messages;
create policy "Channel members can read messages" on messages for select using (
  exists (
    select 1 from channel_members
    where channel_id = messages.channel_id and user_id = auth.uid()
  )
);

drop policy if exists "Channel members can send messages" on messages;
create policy "Channel members can send messages" on messages for insert with check (
  auth.uid() = user_id and exists (
    select 1 from channel_members
    where channel_id = messages.channel_id and user_id = auth.uid()
  )
);

drop policy if exists "Users can edit their own messages" on messages;
create policy "Users can edit their own messages" on messages for update using (user_id = auth.uid());

-- REACTIONS
drop policy if exists "Channel members can read reactions" on reactions;
create policy "Channel members can read reactions" on reactions for select using (
  exists (
    select 1 from messages m
    join channel_members cm on cm.channel_id = m.channel_id
    where m.id = reactions.message_id and cm.user_id = auth.uid()
  )
);

drop policy if exists "Channel members can add reactions" on reactions;
create policy "Channel members can add reactions" on reactions for insert with check (
  auth.uid() = user_id and exists (
    select 1 from messages m
    join channel_members cm on cm.channel_id = m.channel_id
    where m.id = reactions.message_id and cm.user_id = auth.uid()
  )
);

drop policy if exists "Users can remove their own reactions" on reactions;
create policy "Users can remove their own reactions" on reactions for delete using (user_id = auth.uid());

-- ATTACHMENTS
drop policy if exists "Channel members can view attachments" on attachments;
create policy "Channel members can view attachments" on attachments for select using (
  exists (
    select 1 from messages m
    join channel_members cm on cm.channel_id = m.channel_id
    where m.id = attachments.message_id and cm.user_id = auth.uid()
  )
);

drop policy if exists "Uploaders can insert attachments" on attachments;
create policy "Uploaders can insert attachments" on attachments for insert with check (auth.uid() = uploader_id);

-- ============================================================
-- 7. STORAGE BUCKETS & POLICIES
-- ============================================================
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict do nothing;

drop policy if exists "Anyone can view attachments" on storage.objects;
create policy "Anyone can view attachments" on storage.objects for select using (bucket_id = 'attachments');

drop policy if exists "Authenticated users can upload attachments" on storage.objects;
create policy "Authenticated users can upload attachments" on storage.objects for insert with check (bucket_id = 'attachments' and auth.role() = 'authenticated');

drop policy if exists "Uploaders can delete their files" on storage.objects;
create policy "Uploaders can delete their files" on storage.objects for delete using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Anyone can view avatars" on storage.objects;
create policy "Anyone can view avatars" on storage.objects for select using (bucket_id = 'avatars');

drop policy if exists "Authenticated users can upload avatars" on storage.objects;
create policy "Authenticated users can upload avatars" on storage.objects for insert with check (bucket_id = 'avatars' and auth.role() = 'authenticated');

drop policy if exists "Users can update avatars" on storage.objects;
create policy "Users can update avatars" on storage.objects for update using (bucket_id = 'avatars' and auth.role() = 'authenticated');

-- ============================================================
-- 8. REALTIME CONFIGURATION
-- ============================================================
alter table messages replica identity full;
alter table reactions replica identity full;
alter table channel_members replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
    alter publication supabase_realtime add table messages;
  end if;

  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'reactions') then
    alter publication supabase_realtime add table reactions;
  end if;

  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'channel_members') then
    alter publication supabase_realtime add table channel_members;
  end if;
end $$;

-- ============================================================
-- 9. PROJECTS (TRELLO-LIKE KANBAN)
-- ============================================================

create table if not exists project_boards (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists project_columns (
  id uuid primary key default uuid_generate_v4(),
  board_id uuid not null references project_boards(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists project_columns_board_idx on project_columns(board_id, position asc);

create table if not exists project_tasks (
  id uuid primary key default uuid_generate_v4(),
  board_id uuid not null references project_boards(id) on delete cascade,
  column_id uuid not null references project_columns(id) on delete cascade,
  title text not null,
  description text,
  priority text check (priority in ('low', 'medium', 'high', 'urgent')) default 'medium',
  due_date timestamptz,
  assignee_id uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists project_tasks_column_idx on project_tasks(column_id, position asc);
create index if not exists project_tasks_board_idx on project_tasks(board_id);

create table if not exists project_task_comments (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references project_tasks(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  comment text not null,
  created_at timestamptz not null default now()
);

create index if not exists project_task_comments_task_idx on project_task_comments(task_id, created_at asc);

-- RLS FOR PROJECTS
alter table project_boards enable row level security;
alter table project_columns enable row level security;
alter table project_tasks enable row level security;
alter table project_task_comments enable row level security;

drop policy if exists "Authenticated users can read project boards" on project_boards;
create policy "Authenticated users can read project boards" on project_boards for select using (auth.role() = 'authenticated');
drop policy if exists "Authenticated users can insert project boards" on project_boards;
create policy "Authenticated users can insert project boards" on project_boards for insert with check (auth.role() = 'authenticated');
drop policy if exists "Authenticated users can update project boards" on project_boards;
create policy "Authenticated users can update project boards" on project_boards for update using (auth.role() = 'authenticated');
drop policy if exists "Authenticated users can delete project boards" on project_boards;
create policy "Authenticated users can delete project boards" on project_boards for delete using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read project columns" on project_columns;
create policy "Authenticated users can read project columns" on project_columns for select using (auth.role() = 'authenticated');
drop policy if exists "Authenticated users can insert project columns" on project_columns;
create policy "Authenticated users can insert project columns" on project_columns for insert with check (auth.role() = 'authenticated');
drop policy if exists "Authenticated users can update project columns" on project_columns;
create policy "Authenticated users can update project columns" on project_columns for update using (auth.role() = 'authenticated');
drop policy if exists "Authenticated users can delete project columns" on project_columns;
create policy "Authenticated users can delete project columns" on project_columns for delete using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read project tasks" on project_tasks;
create policy "Authenticated users can read project tasks" on project_tasks for select using (auth.role() = 'authenticated');
drop policy if exists "Authenticated users can insert project tasks" on project_tasks;
create policy "Authenticated users can insert project tasks" on project_tasks for insert with check (auth.role() = 'authenticated');
drop policy if exists "Authenticated users can update project tasks" on project_tasks;
create policy "Authenticated users can update project tasks" on project_tasks for update using (auth.role() = 'authenticated');
drop policy if exists "Authenticated users can delete project tasks" on project_tasks;
create policy "Authenticated users can delete project tasks" on project_tasks for delete using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read project task comments" on project_task_comments;
create policy "Authenticated users can read project task comments" on project_task_comments for select using (auth.role() = 'authenticated');
drop policy if exists "Authenticated users can insert project task comments" on project_task_comments;
create policy "Authenticated users can insert project task comments" on project_task_comments for insert with check (auth.role() = 'authenticated');
drop policy if exists "Authenticated users can delete project task comments" on project_task_comments;
create policy "Authenticated users can delete project task comments" on project_task_comments for delete using (auth.role() = 'authenticated');

-- ============================================================
-- 10. IDEAS (TEAM BRAINSTORMING)
-- ============================================================

create table if not exists ideas (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text not null,
  status text check (status in ('under_review', 'planned', 'in_progress', 'completed', 'archived')) default 'under_review',
  author_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ideas_status_idx on ideas(status);

create table if not exists idea_comments (
  id uuid primary key default uuid_generate_v4(),
  idea_id uuid not null references ideas(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idea_comments_idea_idx on idea_comments(idea_id, created_at asc);

-- RLS FOR IDEAS
alter table ideas enable row level security;
alter table idea_comments enable row level security;

drop policy if exists "Authenticated users can read ideas" on ideas;
create policy "Authenticated users can read ideas" on ideas for select using (auth.role() = 'authenticated');
drop policy if exists "Authenticated users can insert ideas" on ideas;
create policy "Authenticated users can insert ideas" on ideas for insert with check (auth.role() = 'authenticated');
drop policy if exists "Authenticated users can update ideas" on ideas;
create policy "Authenticated users can update ideas" on ideas for update using (auth.role() = 'authenticated');
drop policy if exists "Authenticated users can delete ideas" on ideas;
create policy "Authenticated users can delete ideas" on ideas for delete using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read idea comments" on idea_comments;
create policy "Authenticated users can read idea comments" on idea_comments for select using (auth.role() = 'authenticated');
drop policy if exists "Authenticated users can insert idea comments" on idea_comments;
create policy "Authenticated users can insert idea comments" on idea_comments for insert with check (auth.role() = 'authenticated');
drop policy if exists "Authenticated users can delete idea comments" on idea_comments;
create policy "Authenticated users can delete idea comments" on idea_comments for delete using (auth.role() = 'authenticated');

-- REALTIME PUBLICATION FOR PROJECTS & IDEAS
alter table project_tasks replica identity full;
alter table project_columns replica identity full;
alter table ideas replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'project_tasks') then
    alter publication supabase_realtime add table project_tasks;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'project_columns') then
    alter publication supabase_realtime add table project_columns;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ideas') then
    alter publication supabase_realtime add table ideas;
  end if;
end $$;

