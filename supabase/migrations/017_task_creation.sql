-- Durable task creation metadata. Safe on projects that have not applied 013 yet.
-- The RPC is security invoker: all reads and writes retain the signed-in user's RLS.
begin;

alter table public.project_tasks add column if not exists labels text[] not null default '{}';
alter table public.project_tasks add column if not exists task_metadata jsonb not null default '{}';

create table if not exists public.project_task_assignees (
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index if not exists project_task_assignees_user_idx on public.project_task_assignees(user_id);

insert into public.project_task_assignees (task_id, user_id, assigned_by)
select id, assignee_id, created_by from public.project_tasks where assignee_id is not null
on conflict do nothing;

create or replace function public.sync_primary_task_assignee()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.assignee_id is not null then
    insert into public.project_task_assignees (task_id, user_id, assigned_by)
    values (new.id, new.assignee_id, auth.uid()) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_primary_task_assignee() from public, anon;
drop trigger if exists project_tasks_sync_assignee on public.project_tasks;
create trigger project_tasks_sync_assignee after insert or update of assignee_id on public.project_tasks
for each row execute function public.sync_primary_task_assignee();

alter table public.project_task_assignees enable row level security;
drop policy if exists "Visible tasks expose assignees" on public.project_task_assignees;
drop policy if exists "Visible task members add assignees" on public.project_task_assignees;
drop policy if exists "Visible task members remove assignees" on public.project_task_assignees;
create policy "Visible tasks expose assignees" on public.project_task_assignees for select to authenticated
using (user_id = auth.uid() or exists (select 1 from public.project_tasks t where t.id = task_id));
create policy "Visible task members add assignees" on public.project_task_assignees for insert to authenticated
with check (assigned_by = auth.uid() and exists (select 1 from public.project_tasks t where t.id = task_id));
create policy "Visible task members remove assignees" on public.project_task_assignees for delete to authenticated
using (exists (select 1 from public.project_tasks t where t.id = task_id));
grant select, insert, delete on public.project_task_assignees to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'project_task_assignees') then
    alter publication supabase_realtime add table public.project_task_assignees;
  end if;
end;
$$;

create or replace function public.create_project_task(
  p_board_id uuid,
  p_column_id uuid,
  p_title text,
  p_description text default null,
  p_priority text default 'medium',
  p_assignee_ids uuid[] default '{}',
  p_due_date date default null,
  p_start_date date default null,
  p_labels text[] default '{}',
  p_task_metadata jsonb default '{"schemaVersion":1,"labels":[],"checklists":[]}',
  p_position integer default 0,
  p_task_id uuid default null,
  p_estimated_hours numeric default null
)
returns public.project_tasks
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  actor_id uuid := auth.uid();
  created_task public.project_tasks;
  assignee_ids uuid[];
  task_labels text[];
  append_position integer;
begin
  if actor_id is null then
    raise exception 'Your session has expired. Please sign in again.' using errcode = '42501';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 240 then
    raise exception 'Task title must contain between 1 and 240 characters.' using errcode = '22023';
  end if;
  if p_priority is null or p_priority not in ('low', 'medium', 'high', 'urgent') then
    raise exception 'Choose a valid task priority.' using errcode = '22023';
  end if;
  if p_position is null or p_position < 0 then
    raise exception 'Task position must be zero or greater.' using errcode = '22023';
  end if;
  if p_start_date is not null and p_due_date is not null and p_start_date > p_due_date then
    raise exception 'Due date must be on or after the start date.' using errcode = '22023';
  end if;
  if p_estimated_hours is not null and p_estimated_hours < 0 then
    raise exception 'Estimated hours must be zero or greater.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.project_boards where id = p_board_id and archived_at is null) then
    raise exception 'This project is unavailable or you do not have access to it.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.project_columns where id = p_column_id and board_id = p_board_id) then
    raise exception 'Choose a task list that belongs to this project.' using errcode = '22023';
  end if;

  select coalesce(array_agg(user_id order by first_position), '{}') into assignee_ids
  from (select user_id, min(position) as first_position
    from unnest(coalesce(p_assignee_ids, '{}')) with ordinality as a(user_id, position)
    where user_id is not null group by user_id) as unique_assignees;
  select coalesce(array_agg(label order by first_position), '{}') into task_labels
  from (select btrim(label) as label, min(position) as first_position
    from unnest(coalesce(p_labels, '{}')) with ordinality as l(label, position)
    where nullif(btrim(label), '') is not null group by btrim(label)) as unique_labels;
  if exists (select 1 from unnest(task_labels) as l(label) where char_length(label) > 80) then
    raise exception 'Each label must contain no more than 80 characters.' using errcode = '22023';
  end if;
  if p_task_metadata is null or jsonb_typeof(p_task_metadata) <> 'object'
    or p_task_metadata -> 'schemaVersion' is distinct from '1'::jsonb
    or coalesce(jsonb_typeof(p_task_metadata -> 'labels'), '') <> 'array'
    or coalesce(jsonb_typeof(p_task_metadata -> 'checklists'), '') <> 'array' then
    raise exception 'Task metadata must contain valid labels and checklists.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_task_metadata -> 'labels') as l(label)
    where jsonb_typeof(label) <> 'object'
      or coalesce(jsonb_typeof(label -> 'name'), '') <> 'string'
      or char_length(btrim(label ->> 'name')) not between 1 and 80)
    or array(select label ->> 'name' from jsonb_array_elements(p_task_metadata -> 'labels') as l(label)) is distinct from task_labels then
    raise exception 'Task labels must match the selected label names.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_task_metadata -> 'checklists') as c(checklist)
    where jsonb_typeof(checklist) <> 'object'
      or coalesce(jsonb_typeof(checklist -> 'title'), '') <> 'string'
      or char_length(btrim(checklist ->> 'title')) not between 1 and 160
      or coalesce(jsonb_typeof(checklist -> 'items'), '') <> 'array') then
    raise exception 'Each checklist must contain a title and a list of items.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_task_metadata -> 'checklists') as c(checklist)
    cross join lateral jsonb_array_elements(checklist -> 'items') as i(item)
    where jsonb_typeof(item) <> 'object'
      or coalesce(jsonb_typeof(item -> 'text'), '') <> 'string'
      or char_length(btrim(item ->> 'text')) not between 1 and 500
      or coalesce(jsonb_typeof(item -> 'completed'), '') <> 'boolean') then
    raise exception 'Each checklist item needs text of 1 to 500 characters and a valid completion state.' using errcode = '22023';
  end if;

  -- Serialize appends without requiring UPDATE rights on the project column.
  perform pg_advisory_xact_lock(hashtext(p_column_id::text)::bigint);
  select greatest(p_position, coalesce(max(position) + 1, 0), 0) into append_position
  from public.project_tasks where column_id = p_column_id;

  insert into public.project_tasks (id, board_id, column_id, title, description, priority,
    assignee_id, due_date, start_date, estimated_hours, labels, task_metadata, created_by, position)
  values (coalesce(p_task_id, gen_random_uuid()), p_board_id, p_column_id, btrim(p_title), nullif(btrim(p_description), ''), p_priority,
    assignee_ids[1], p_due_date, p_start_date, p_estimated_hours, task_labels, p_task_metadata, actor_id, append_position)
  returning * into created_task;

  insert into public.project_task_assignees (task_id, user_id, assigned_by)
  select created_task.id, user_id, actor_id from unnest(assignee_ids) as a(user_id)
  on conflict do nothing;
  return created_task;
end;
$$;
revoke all on function public.create_project_task(uuid, uuid, text, text, text, uuid[], date, date, text[], jsonb, integer, uuid, numeric) from public, anon;
grant execute on function public.create_project_task(uuid, uuid, text, text, text, uuid[], date, date, text[], jsonb, integer, uuid, numeric) to authenticated;

notify pgrst, 'reload schema';
commit;
