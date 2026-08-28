-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ============================================================
-- PROFILES
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'User',
  email text not null default '',
  avatar_url text,
  job_title text,
  status text not null default 'offline' check (status in ('online', 'away', 'offline')),
  created_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- CHANNELS
-- ============================================================
create table if not exists channels (
  id uuid primary key default uuid_generate_v4(),
  type text not null default 'public' check (type in ('public', 'private', 'dm', 'group_dm')),
  name text,
  topic text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

-- Index for sorting/filtering
create index if not exists channels_type_idx on channels(type);
create index if not exists channels_created_by_idx on channels(created_by);

-- ============================================================
-- CHANNEL MEMBERS
-- ============================================================
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

-- ============================================================
-- MESSAGES
-- ============================================================
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
-- Full-text search
create index if not exists messages_body_trgm_idx on messages using gin(body gin_trgm_ops);

-- ============================================================
-- REACTIONS
-- ============================================================
create table if not exists reactions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists reactions_message_idx on reactions(message_id);

-- ============================================================
-- ATTACHMENTS
-- ============================================================
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
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table channels enable row level security;
alter table channel_members enable row level security;
alter table messages enable row level security;
alter table reactions enable row level security;
alter table attachments enable row level security;

-- PROFILES
create policy "Anyone can read profiles"
  on profiles for select
  using (true);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- CHANNELS
create policy "Members can read their channels"
  on channels for select
  using (
    exists (
      select 1 from channel_members
      where channel_id = channels.id
      and user_id = auth.uid()
    )
  );

create policy "Authenticated users can create channels"
  on channels for insert
  with check (auth.role() = 'authenticated');

create policy "Channel owners/admins can update channels"
  on channels for update
  using (
    exists (
      select 1 from channel_members
      where channel_id = channels.id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
    )
  );

-- CHANNEL MEMBERS
create policy "Members can view channel memberships"
  on channel_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from channel_members cm2
      where cm2.channel_id = channel_members.channel_id
      and cm2.user_id = auth.uid()
    )
  );

create policy "Authenticated users can join public channels"
  on channel_members for insert
  with check (auth.role() = 'authenticated');

create policy "Members can update their own membership"
  on channel_members for update
  using (user_id = auth.uid());

-- MESSAGES
create policy "Channel members can read messages"
  on messages for select
  using (
    exists (
      select 1 from channel_members
      where channel_id = messages.channel_id
      and user_id = auth.uid()
    )
  );

create policy "Channel members can send messages"
  on messages for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from channel_members
      where channel_id = messages.channel_id
      and user_id = auth.uid()
    )
  );

create policy "Users can edit their own messages"
  on messages for update
  using (user_id = auth.uid());

-- REACTIONS
create policy "Channel members can read reactions"
  on reactions for select
  using (
    exists (
      select 1 from messages m
      join channel_members cm on cm.channel_id = m.channel_id
      where m.id = reactions.message_id
      and cm.user_id = auth.uid()
    )
  );

create policy "Channel members can add reactions"
  on reactions for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from messages m
      join channel_members cm on cm.channel_id = m.channel_id
      where m.id = reactions.message_id
      and cm.user_id = auth.uid()
    )
  );

create policy "Users can remove their own reactions"
  on reactions for delete
  using (user_id = auth.uid());

-- ATTACHMENTS
create policy "Channel members can view attachments"
  on attachments for select
  using (
    exists (
      select 1 from messages m
      join channel_members cm on cm.channel_id = m.channel_id
      where m.id = attachments.message_id
      and cm.user_id = auth.uid()
    )
  );

create policy "Uploaders can insert attachments"
  on attachments for insert
  with check (
    auth.uid() = uploader_id
  );

-- ============================================================
-- STORAGE BUCKET
-- ============================================================
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict do nothing;

create policy "Anyone can view attachments"
  on storage.objects for select
  using (bucket_id = 'attachments');

create policy "Authenticated users can upload"
  on storage.objects for insert
  with check (bucket_id = 'attachments' and auth.role() = 'authenticated');

create policy "Uploaders can delete their files"
  on storage.objects for delete
  using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- REALTIME
-- ============================================================
begin;
  -- Enable realtime on tables
  drop publication if exists supabase_realtime;
  create publication supabase_realtime for table messages, reactions, channel_members;
commit;
