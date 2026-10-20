-- Loop hardening: safe membership updates, private files, search, and onboarding.

create unique index if not exists profiles_email_lower_key
  on public.profiles (lower(email));

-- Read receipts must not allow clients to change their membership role.
drop policy if exists "Members can update their own membership" on public.channel_members;

create or replace function public.mark_channel_read(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.channel_members
  set last_read_at = now()
  where channel_id = p_channel_id and user_id = auth.uid();
  if not found then raise exception 'Not a member of this channel'; end if;
end;
$$;
revoke all on function public.mark_channel_read(uuid) from public, anon;
grant execute on function public.mark_channel_read(uuid) to authenticated;

-- Indexed full-text message search; RLS continues to restrict visible rows.
alter table public.messages
  add column if not exists search_vector tsvector
  generated always as (to_tsvector('english', coalesce(body, ''))) stored;
create index if not exists messages_search_vector_idx
  on public.messages using gin(search_vector);

create or replace function public.search_messages(p_query text, p_limit integer default 50)
returns setof public.messages
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select m.* from public.messages m
  where m.deleted_at is null
    and m.search_vector @@ websearch_to_tsquery('english', nullif(btrim(p_query), ''))
  order by ts_rank(m.search_vector, websearch_to_tsquery('english', btrim(p_query))) desc,
           m.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;
revoke all on function public.search_messages(text, integer) from public, anon;
grant execute on function public.search_messages(text, integer) to authenticated;

-- Ensure a usable workspace exists and every current profile can enter it.
do $$
declare
  v_channel_id uuid;
  v_owner_id uuid;
begin
  select id into v_channel_id from public.channels
  where type = 'public' and archived_at is null order by created_at limit 1;
  if v_channel_id is null then
    select id into v_owner_id from public.profiles order by created_at limit 1;
    if v_owner_id is not null then
      insert into public.channels(type, name, topic, created_by)
      values('public', 'general', 'Company-wide announcements and conversation', v_owner_id)
      returning id into v_channel_id;
    end if;
  end if;
  if v_channel_id is not null then
    insert into public.channel_members(channel_id, user_id, role)
    select v_channel_id, p.id,
      case when p.id = (select created_by from public.channels where id = v_channel_id)
        then 'owner' else 'member' end
    from public.profiles p
    on conflict(channel_id, user_id) do nothing;
  end if;
end $$;

-- Attachments are private. Clients receive short-lived signed URLs after RLS.
update storage.buckets set public = false, file_size_limit = 26214400
where id = 'attachments';

drop policy if exists "Anyone can view attachments" on storage.objects;
drop policy if exists "Authenticated users can upload attachments" on storage.objects;
drop policy if exists "Uploaders can delete their files" on storage.objects;
drop policy if exists "Members can view attachment objects" on storage.objects;
drop policy if exists "Users can upload own attachment objects" on storage.objects;
drop policy if exists "Users can delete own attachment objects" on storage.objects;

create policy "Members can view attachment objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'attachments' and exists (
    select 1 from public.attachments a
    join public.messages m on m.id = a.message_id
    join public.channel_members cm on cm.channel_id = m.channel_id
    where a.object_key = name and cm.user_id = auth.uid()
  )
);

create policy "Users can upload own attachment objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete own attachment objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);
