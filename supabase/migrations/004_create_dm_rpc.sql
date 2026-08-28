-- SECURITY DEFINER functions run as the DB owner and bypass RLS.
-- This is the correct Supabase pattern for multi-table atomic ops.

create or replace function create_dm_channel(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_id uuid;
begin
  -- Return existing DM channel if one already exists between these two users
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

  -- Create the DM channel
  insert into channels (type, name, created_by)
  values ('dm', null, auth.uid())
  returning id into v_channel_id;

  -- Add both participants
  insert into channel_members (channel_id, user_id, role, last_read_at, notification_pref)
  values
    (v_channel_id, auth.uid(),      'member', now(), 'all'),
    (v_channel_id, target_user_id,  'member', now(), 'all');

  return v_channel_id;
end;
$$;

-- Also create a function for creating regular channels atomically
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
