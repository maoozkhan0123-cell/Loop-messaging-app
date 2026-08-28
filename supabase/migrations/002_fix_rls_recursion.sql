-- Fix recursive channel_members RLS policy.
-- The original policy used EXISTS (SELECT ... FROM channel_members ...) inside
-- a channel_members policy, causing infinite recursion and a 500 error.
-- Solution: a SECURITY DEFINER function that reads channel_members as the
-- function owner (bypassing RLS), so the policy itself never recurses.

create or replace function get_my_channel_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select channel_id from channel_members where user_id = auth.uid();
$$;

-- Replace the recursive policy with a non-recursive one
drop policy if exists "Members can view channel memberships" on channel_members;

create policy "Members can view channel memberships"
  on channel_members for select
  using (
    user_id = auth.uid()
    or channel_id = any(array(select get_my_channel_ids()))
  );
