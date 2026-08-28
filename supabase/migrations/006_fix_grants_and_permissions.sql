-- ============================================================
-- Migration 006: Explicit grants + permission hardening
-- ============================================================
-- Supabase's default gives PUBLIC execute on functions, but
-- explicitly granting to `authenticated` ensures no edge-case
-- revoke from prior migrations causes silent RPC 403 errors.

-- send_message: called from MessageInput / FileUpload
grant execute on function send_message(uuid, text, uuid) to authenticated;

-- edit_message / delete_message: called from Message.tsx hover actions
grant execute on function edit_message(uuid, text)  to authenticated;
grant execute on function delete_message(uuid)      to authenticated;

-- toggle_reaction: called from emoji picker
grant execute on function toggle_reaction(uuid, text) to authenticated;

-- create_channel / create_dm_channel: called from Sidebar
grant execute on function create_channel(text, text, text) to authenticated;
grant execute on function create_dm_channel(uuid)          to authenticated;

-- get_my_channel_ids: used internally by RLS policies; also grant anon
-- so policies still evaluate correctly during server-side pre-auth requests
grant execute on function get_my_channel_ids() to authenticated, anon;

-- ----------------------------------------------------------------
-- Verify REPLICA IDENTITY FULL (safe to re-run)
-- ----------------------------------------------------------------
alter table messages        replica identity full;
alter table reactions       replica identity full;
alter table channel_members replica identity full;

-- ----------------------------------------------------------------
-- Ensure tables are in the realtime publication (idempotent)
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- Ensure profiles table has an insert policy so handle_new_user
-- trigger can always create a profile on signup (covers edge case
-- where the trigger fires but RLS blocks it in some Supabase configs)
-- ----------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'profiles' and policyname = 'Service role can insert profiles'
  ) then
    -- Allow the trigger function (which runs as service role / postgres) to insert
    execute $p$
      create policy "Service role can insert profiles"
        on profiles for insert
        with check (true)
    $p$;
  end if;
end $$;
