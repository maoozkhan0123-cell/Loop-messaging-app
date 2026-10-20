-- Complete and harden the Loop schema against the application's actual queries.
-- Safe to run after migrations 001-006 and safe to re-run.

-- Features present in the UI but absent from the original migration chain.
create table if not exists public.project_boards (
  id uuid primary key default uuid_generate_v4(),
  name text not null, description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), archived_at timestamptz
);
create table if not exists public.project_columns (
  id uuid primary key default uuid_generate_v4(),
  board_id uuid not null references public.project_boards(id) on delete cascade,
  name text not null, position integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.project_tasks (
  id uuid primary key default uuid_generate_v4(),
  board_id uuid not null references public.project_boards(id) on delete cascade,
  column_id uuid not null references public.project_columns(id) on delete cascade,
  title text not null, description text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date timestamptz, assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  position integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.project_task_comments (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  comment text not null, created_at timestamptz not null default now()
);
create table if not exists public.ideas (
  id uuid primary key default uuid_generate_v4(),
  title text not null, description text not null,
  status text not null default 'under_review' check (status in ('under_review', 'planned', 'in_progress', 'completed', 'archived')),
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.idea_comments (
  id uuid primary key default uuid_generate_v4(),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  content text not null, created_at timestamptz not null default now()
);

create index if not exists project_columns_board_idx on public.project_columns(board_id, position);
create index if not exists project_tasks_column_idx on public.project_tasks(column_id, position);
create index if not exists project_tasks_board_idx on public.project_tasks(board_id);
create index if not exists project_task_comments_task_idx on public.project_task_comments(task_id, created_at);
create index if not exists ideas_status_idx on public.ideas(status);
create index if not exists idea_comments_idea_idx on public.idea_comments(idea_id, created_at);

alter table public.project_boards enable row level security;
alter table public.project_columns enable row level security;
alter table public.project_tasks enable row level security;
alter table public.project_task_comments enable row level security;
alter table public.ideas enable row level security;
alter table public.idea_comments enable row level security;

drop policy if exists "Authenticated users can read project boards" on public.project_boards;
create policy "Authenticated users can read project boards" on public.project_boards for select to authenticated using (true);
drop policy if exists "Authenticated users can update project boards" on public.project_boards;
create policy "Authenticated users can update project boards" on public.project_boards for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated users can delete project boards" on public.project_boards;
create policy "Authenticated users can delete project boards" on public.project_boards for delete to authenticated using (true);

drop policy if exists "Authenticated users can read project columns" on public.project_columns;
create policy "Authenticated users can read project columns" on public.project_columns for select to authenticated using (true);
drop policy if exists "Authenticated users can insert project columns" on public.project_columns;
create policy "Authenticated users can insert project columns" on public.project_columns for insert to authenticated with check (true);
drop policy if exists "Authenticated users can update project columns" on public.project_columns;
create policy "Authenticated users can update project columns" on public.project_columns for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated users can delete project columns" on public.project_columns;
create policy "Authenticated users can delete project columns" on public.project_columns for delete to authenticated using (true);

drop policy if exists "Authenticated users can read project tasks" on public.project_tasks;
create policy "Authenticated users can read project tasks" on public.project_tasks for select to authenticated using (true);
drop policy if exists "Authenticated users can update project tasks" on public.project_tasks;
create policy "Authenticated users can update project tasks" on public.project_tasks for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated users can delete project tasks" on public.project_tasks;
create policy "Authenticated users can delete project tasks" on public.project_tasks for delete to authenticated using (true);

drop policy if exists "Authenticated users can read project task comments" on public.project_task_comments;
create policy "Authenticated users can read project task comments" on public.project_task_comments for select to authenticated using (true);
drop policy if exists "Authenticated users can delete project task comments" on public.project_task_comments;
create policy "Authenticated users can delete project task comments" on public.project_task_comments for delete to authenticated using (true);

drop policy if exists "Authenticated users can read ideas" on public.ideas;
create policy "Authenticated users can read ideas" on public.ideas for select to authenticated using (true);
drop policy if exists "Authenticated users can update ideas" on public.ideas;
create policy "Authenticated users can update ideas" on public.ideas for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated users can delete ideas" on public.ideas;
create policy "Authenticated users can delete ideas" on public.ideas for delete to authenticated using (true);

drop policy if exists "Authenticated users can read idea comments" on public.idea_comments;
create policy "Authenticated users can read idea comments" on public.idea_comments for select to authenticated using (true);
drop policy if exists "Authenticated users can delete idea comments" on public.idea_comments;
create policy "Authenticated users can delete idea comments" on public.idea_comments for delete to authenticated using (true);

-- Avatar uploads use a dedicated public bucket in IconRail.
insert into storage.buckets(id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Anyone can view avatars" on storage.objects;
create policy "Anyone can view avatars" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "Authenticated users can upload avatars" on storage.objects;
create policy "Authenticated users can upload avatars" on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users can update avatars" on storage.objects;
create policy "Users can update avatars" on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Query-supporting indexes used by channel lists, threads, files, projects and ideas.
create index if not exists messages_channel_parent_created_idx
  on public.messages(channel_id, parent_id, created_at desc);
create index if not exists attachments_uploader_created_idx
  on public.attachments(uploader_id, created_at desc);
create index if not exists project_boards_active_created_idx
  on public.project_boards(archived_at, created_at desc);
create index if not exists project_tasks_assignee_idx
  on public.project_tasks(assignee_id) where assignee_id is not null;
create index if not exists project_task_comments_user_idx
  on public.project_task_comments(user_id) where user_id is not null;
create index if not exists ideas_author_created_idx
  on public.ideas(author_id, created_at desc);
create index if not exists idea_comments_author_idx
  on public.idea_comments(author_id) where author_id is not null;

-- Only logged-in users need the team directory. The signup trigger is SECURITY
-- DEFINER and does not require a permissive client-side insert policy.
drop policy if exists "Anyone can read profiles" on public.profiles;
drop policy if exists "Authenticated users can read profiles" on public.profiles;
create policy "Authenticated users can read profiles"
  on public.profiles for select to authenticated
  using (true);

drop policy if exists "Service role can insert profiles" on public.profiles;

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Direct membership inserts may only join the caller to a public channel.
-- DM/private membership is managed atomically by SECURITY DEFINER RPCs.
drop policy if exists "Authenticated users can join public channels" on public.channel_members;
create policy "Users can join public channels"
  on public.channel_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'member'
    and exists (
      select 1 from public.channels c
      where c.id = channel_id and c.type = 'public' and c.archived_at is null
    )
  );

drop policy if exists "Members can update their own membership" on public.channel_members;
create policy "Members can update their own membership"
  on public.channel_members for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- An attachment row must belong to the caller and to a message in one of their
-- channels. This matches every upload path used by the app.
drop policy if exists "Uploaders can insert attachments" on public.attachments;
create policy "Members can insert attachments"
  on public.attachments for insert to authenticated
  with check (
    uploader_id = auth.uid()
    and exists (
      select 1
      from public.messages m
      join public.channel_members cm on cm.channel_id = m.channel_id
      where m.id = message_id and cm.user_id = auth.uid()
    )
  );

drop policy if exists "Uploaders can delete attachments" on public.attachments;
create policy "Uploaders can delete attachments"
  on public.attachments for delete to authenticated
  using (uploader_id = auth.uid());

-- Ensure user-owned values cannot be forged on team content.
drop policy if exists "Authenticated users can insert project boards" on public.project_boards;
create policy "Authenticated users can insert project boards"
  on public.project_boards for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "Authenticated users can insert project tasks" on public.project_tasks;
create policy "Authenticated users can insert project tasks"
  on public.project_tasks for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "Authenticated users can insert project task comments" on public.project_task_comments;
create policy "Authenticated users can insert project task comments"
  on public.project_task_comments for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Authenticated users can insert ideas" on public.ideas;
create policy "Authenticated users can insert ideas"
  on public.ideas for insert to authenticated
  with check (author_id = auth.uid());

drop policy if exists "Authenticated users can insert idea comments" on public.idea_comments;
create policy "Authenticated users can insert idea comments"
  on public.idea_comments for insert to authenticated
  with check (author_id = auth.uid());

-- Create a channel atomically. A public channel is visible to the whole current
-- team immediately; future users are added by handle_new_user().
create or replace function public.create_channel(
  p_name text,
  p_type text default 'public',
  p_topic text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_channel_id uuid;
  v_name text := nullif(btrim(p_name), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if v_name is null or char_length(v_name) > 80 then
    raise exception 'Channel name must be between 1 and 80 characters';
  end if;
  if p_type not in ('public', 'private') then
    raise exception 'Only public or private channels can be created here';
  end if;

  insert into public.channels (type, name, topic, created_by)
  values (p_type, v_name, nullif(btrim(p_topic), ''), auth.uid())
  returning id into v_channel_id;

  if p_type = 'public' then
    insert into public.channel_members (channel_id, user_id, role)
    select v_channel_id, p.id,
      case when p.id = auth.uid() then 'owner' else 'member' end
    from public.profiles p
    on conflict (channel_id, user_id) do nothing;
  else
    insert into public.channel_members (channel_id, user_id, role)
    values (v_channel_id, auth.uid(), 'owner');
  end if;

  return v_channel_id;
end;
$$;

-- Create one canonical DM per user pair, including under simultaneous requests.
create or replace function public.create_dm_channel(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_channel_id uuid;
  v_pair_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if target_user_id is null or target_user_id = auth.uid() then
    raise exception 'Choose another user for a direct message';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'Target user does not exist';
  end if;

  v_pair_key := least(auth.uid()::text, target_user_id::text) || ':' ||
                greatest(auth.uid()::text, target_user_id::text);
  perform pg_advisory_xact_lock(hashtextextended(v_pair_key, 0));

  select c.id into v_channel_id
  from public.channels c
  join public.channel_members mine
    on mine.channel_id = c.id and mine.user_id = auth.uid()
  join public.channel_members theirs
    on theirs.channel_id = c.id and theirs.user_id = target_user_id
  where c.type = 'dm'
    and c.archived_at is null
    and (select count(*) from public.channel_members all_members where all_members.channel_id = c.id) = 2
  order by c.created_at
  limit 1;

  if v_channel_id is null then
    insert into public.channels (type, created_by)
    values ('dm', auth.uid()) returning id into v_channel_id;

    insert into public.channel_members (channel_id, user_id, role)
    values
      (v_channel_id, auth.uid(), 'member'),
      (v_channel_id, target_user_id, 'member');
  end if;

  return v_channel_id;
end;
$$;

-- Validate thread integrity before inserting a message.
create or replace function public.send_message(
  p_channel_id uuid,
  p_body text,
  p_parent_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_body text := nullif(btrim(p_body), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not exists (
    select 1 from public.channel_members
    where channel_id = p_channel_id and user_id = auth.uid()
  ) then
    raise exception 'Not a member of this channel';
  end if;
  if p_parent_id is not null and not exists (
    select 1 from public.messages
    where id = p_parent_id and channel_id = p_channel_id and parent_id is null
  ) then
    raise exception 'Invalid thread parent';
  end if;
  if v_body is not null and char_length(v_body) > 20000 then
    raise exception 'Message is too long';
  end if;

  insert into public.messages (channel_id, user_id, body, parent_id)
  values (p_channel_id, auth.uid(), v_body, p_parent_id)
  returning id into v_id;

  update public.channel_members set last_read_at = now()
  where channel_id = p_channel_id and user_id = auth.uid();
  return v_id;
end;
$$;

-- SECURITY DEFINER functions must not retain PostgreSQL's default PUBLIC execute.
revoke all on function public.get_my_channel_ids() from public, anon;
revoke all on function public.create_channel(text, text, text) from public, anon;
revoke all on function public.create_dm_channel(uuid) from public, anon;
revoke all on function public.send_message(uuid, text, uuid) from public, anon;
revoke all on function public.edit_message(uuid, text) from public, anon;
revoke all on function public.delete_message(uuid) from public, anon;
revoke all on function public.toggle_reaction(uuid, text) from public, anon;

grant execute on function public.get_my_channel_ids() to authenticated;
grant execute on function public.create_channel(text, text, text) to authenticated;
grant execute on function public.create_dm_channel(uuid) to authenticated;
grant execute on function public.send_message(uuid, text, uuid) to authenticated;
grant execute on function public.edit_message(uuid, text) to authenticated;
grant execute on function public.delete_message(uuid) to authenticated;
grant execute on function public.toggle_reaction(uuid, text) to authenticated;

-- Realtime tables actually subscribed to by the React hooks.
alter table public.attachments replica identity full;
alter table public.idea_comments replica identity full;
alter table public.project_tasks replica identity full;
alter table public.project_columns replica identity full;
alter table public.ideas replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attachments'
  ) then
    alter publication supabase_realtime add table public.attachments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'idea_comments'
  ) then
    alter publication supabase_realtime add table public.idea_comments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_tasks'
  ) then
    alter publication supabase_realtime add table public.project_tasks;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_columns'
  ) then
    alter publication supabase_realtime add table public.project_columns;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ideas'
  ) then
    alter publication supabase_realtime add table public.ideas;
  end if;
end $$;
