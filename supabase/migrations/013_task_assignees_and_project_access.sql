-- Multiple assignees per task, and project visibility limited to the people involved.
-- Requires 011 (public.is_ceo). Safe to run more than once.

begin;

-- ── Task assignees ──────────────────────────────────────────────────────────
create table if not exists public.project_task_assignees (
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index if not exists project_task_assignees_user_idx on public.project_task_assignees(user_id);

-- Existing single assignees become rows in the new table.
insert into public.project_task_assignees (task_id, user_id)
select id, assignee_id from public.project_tasks where assignee_id is not null
on conflict do nothing;

-- Keep the table in step when only the legacy assignee_id column is set (e.g. new tasks).
create or replace function public.sync_primary_task_assignee()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.assignee_id is not null then
    insert into public.project_task_assignees (task_id, user_id, assigned_by)
    values (new.id, new.assignee_id, auth.uid())
    on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists project_tasks_sync_assignee on public.project_tasks;
create trigger project_tasks_sync_assignee
  after insert or update of assignee_id on public.project_tasks
  for each row execute function public.sync_primary_task_assignee();

-- ── Last change on a task (drives "unread" in assignees' inboxes) ───────────
alter table public.project_tasks add column if not exists updated_at timestamptz not null default now();
alter table public.project_tasks add column if not exists updated_by uuid references public.profiles(id) on delete set null;
update public.project_tasks set updated_by = created_by where updated_by is null;

create or replace function public.touch_project_task()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
drop trigger if exists project_tasks_touch on public.project_tasks;
create trigger project_tasks_touch before update on public.project_tasks
  for each row execute function public.touch_project_task();

-- ── Who can see a project ───────────────────────────────────────────────────
create or replace function public.is_workspace_admin()
returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'ceo')
      or coalesce(auth.jwt() ->> 'email', '') = 'loop@bytechsol.com';
$$;

-- Security definer so board and task policies can check each other without recursion.
create or replace function public.can_view_board(p_board_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_workspace_admin()
    or exists (select 1 from public.project_boards b where b.id = p_board_id and b.created_by = auth.uid())
    or exists (
      select 1 from public.project_tasks t
      where t.board_id = p_board_id
        and (t.assignee_id = auth.uid() or t.created_by = auth.uid()
             or exists (select 1 from public.project_task_assignees a where a.task_id = t.id and a.user_id = auth.uid()))
    );
$$;

create or replace function public.can_view_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.project_tasks t where t.id = p_task_id and public.can_view_board(t.board_id));
$$;

revoke all on function public.is_workspace_admin() from public, anon;
revoke all on function public.can_view_board(uuid) from public, anon;
revoke all on function public.can_view_task(uuid) from public, anon;
grant execute on function public.is_workspace_admin() to authenticated;
grant execute on function public.can_view_board(uuid) to authenticated;
grant execute on function public.can_view_task(uuid) to authenticated;

-- ── Policies: replace "everyone can see everything" ─────────────────────────
drop policy if exists "Authenticated users can read project boards" on public.project_boards;
drop policy if exists "Authenticated users can update project boards" on public.project_boards;
drop policy if exists "Authenticated users can delete project boards" on public.project_boards;
drop policy if exists "Project members can read boards" on public.project_boards;
drop policy if exists "Project members can update boards" on public.project_boards;
drop policy if exists "Board owners can delete boards" on public.project_boards;
create policy "Project members can read boards" on public.project_boards for select to authenticated
  using (public.can_view_board(id));
create policy "Project members can update boards" on public.project_boards for update to authenticated
  using (public.can_view_board(id)) with check (public.can_view_board(id));
create policy "Board owners can delete boards" on public.project_boards for delete to authenticated
  using (created_by = auth.uid() or public.is_workspace_admin());

drop policy if exists "Authenticated users can read project columns" on public.project_columns;
drop policy if exists "Authenticated users can insert project columns" on public.project_columns;
drop policy if exists "Authenticated users can update project columns" on public.project_columns;
drop policy if exists "Authenticated users can delete project columns" on public.project_columns;
drop policy if exists "Project members can manage columns" on public.project_columns;
-- Columns are inserted right after a board is created, so the creator must already pass.
create policy "Project members can manage columns" on public.project_columns for all to authenticated
  using (public.can_view_board(board_id)) with check (public.can_view_board(board_id));

drop policy if exists "Authenticated users can read project tasks" on public.project_tasks;
drop policy if exists "Authenticated users can insert project tasks" on public.project_tasks;
drop policy if exists "Authenticated users can update project tasks" on public.project_tasks;
drop policy if exists "Authenticated users can delete project tasks" on public.project_tasks;
drop policy if exists "Project members can read tasks" on public.project_tasks;
drop policy if exists "Project members can insert tasks" on public.project_tasks;
drop policy if exists "Project members can update tasks" on public.project_tasks;
drop policy if exists "Project members can delete tasks" on public.project_tasks;
create policy "Project members can read tasks" on public.project_tasks for select to authenticated
  using (public.can_view_board(board_id));
create policy "Project members can insert tasks" on public.project_tasks for insert to authenticated
  with check (public.can_view_board(board_id) and created_by = auth.uid());
create policy "Project members can update tasks" on public.project_tasks for update to authenticated
  using (public.can_view_board(board_id)) with check (public.can_view_board(board_id));
create policy "Project members can delete tasks" on public.project_tasks for delete to authenticated
  using (public.can_view_board(board_id));

drop policy if exists "Authenticated users can read project task comments" on public.project_task_comments;
drop policy if exists "Authenticated users can insert project task comments" on public.project_task_comments;
drop policy if exists "Authenticated users can delete project task comments" on public.project_task_comments;
drop policy if exists "Project members can read task comments" on public.project_task_comments;
drop policy if exists "Project members can add task comments" on public.project_task_comments;
drop policy if exists "Authors can delete task comments" on public.project_task_comments;
create policy "Project members can read task comments" on public.project_task_comments for select to authenticated
  using (public.can_view_task(task_id));
create policy "Project members can add task comments" on public.project_task_comments for insert to authenticated
  with check (public.can_view_task(task_id) and user_id = auth.uid());
create policy "Authors can delete task comments" on public.project_task_comments for delete to authenticated
  using (user_id = auth.uid() or public.is_workspace_admin());

alter table public.project_task_assignees enable row level security;
drop policy if exists "Project members can read assignees" on public.project_task_assignees;
drop policy if exists "Project members can assign people" on public.project_task_assignees;
drop policy if exists "Project members can unassign people" on public.project_task_assignees;
create policy "Project members can read assignees" on public.project_task_assignees for select to authenticated
  using (user_id = auth.uid() or public.can_view_task(task_id));
create policy "Project members can assign people" on public.project_task_assignees for insert to authenticated
  with check (public.can_view_task(task_id));
create policy "Project members can unassign people" on public.project_task_assignees for delete to authenticated
  using (public.can_view_task(task_id));
grant select, insert, delete on public.project_task_assignees to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.project_task_assignees;
exception when duplicate_object or undefined_object then null;
end $$;

commit;
