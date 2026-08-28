-- ============================================================
-- PHASE 2: Core Messaging — Fix realtime + message RPCs
-- ============================================================

-- 1. REPLICA IDENTITY FULL so Supabase Realtime can broadcast
--    UPDATE and DELETE events with full row data (not just PK)
alter table messages       replica identity full;
alter table reactions      replica identity full;
alter table channel_members replica identity full;

-- 2. Add tables to the existing supabase_realtime publication.
--    Migration 001 incorrectly dropped and recreated it — this
--    safely adds tables if they are not already included.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reactions'
  ) then
    alter publication supabase_realtime add table reactions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'channel_members'
  ) then
    alter publication supabase_realtime add table channel_members;
  end if;
end $$;

-- 3. send_message — inserts a message (or thread reply) as the
--    calling user, then bumps their last_read_at.
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
  -- Membership guard
  if not exists (
    select 1 from channel_members
    where channel_id = p_channel_id and user_id = auth.uid()
  ) then
    raise exception 'Not a member of this channel';
  end if;

  insert into messages (channel_id, user_id, body, parent_id)
  values (p_channel_id, auth.uid(), trim(p_body), p_parent_id)
  returning id into v_id;

  -- Keep last_read_at current for the sender
  update channel_members
  set last_read_at = now()
  where channel_id = p_channel_id and user_id = auth.uid();

  return v_id;
end;
$$;

-- 4. edit_message — only the author can edit their own message
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

-- 5. delete_message — soft-delete; preserves thread integrity
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

-- 6. toggle_reaction — add if not present, remove if already reacted
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
