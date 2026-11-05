-- Task-level privacy and tighter write rules.
-- A task is visible only to its creator, its assignees and collaborators, the project owner,
-- and workspace admins/CEO. Seeing a project no longer means seeing every task in it.
-- Requires 013. Safe to run more than once.

begin;

-- ── Helpers (security definer so policies can call each other without recursion) ──
create or replace function public.can_view_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_workspace_admin() or exists (
    select 1
    from public.project_tasks t
    left join public.project_boards b on b.id = t.board_id
    where t.id = p_task_id
      and (b.created_by = auth.uid()
        or t.created_by = auth.uid()
        or t.assignee_id = auth.uid()
        or exists (select 1 from public.project_task_assignees a where a.task_id = t.id and a.user_id = auth.uid())
        or exists (select 1 from public.project_task_collaborators c where c.task_id = t.id and c.user_id = auth.uid()))
  );
$$;

-- A project is visible to its owner and to anyone who can see at least one task in it.
create or replace function public.can_view_board(p_board_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_workspace_admin()
    or exists (select 1 from public.project_boards b where b.id = p_board_id and b.created_by = auth.uid())
    or exists (
      select 1 from public.project_tasks t
      where t.board_id = p_board_id
        and (t.assignee_id = auth.uid() or t.created_by = auth.uid()
          or exists (select 1 from public.project_task_assignees a where a.task_id = t.id and a.user_id = auth.uid())
          or exists (select 1 from public.project_task_collaborators c where c.task_id = t.id and c.user_id = auth.uid()))
    );
$$;

-- Structural changes (columns, renaming) belong to the project owner and admins.
create or replace function public.can_manage_board(p_board_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_workspace_admin()
    or exists (select 1 from public.project_boards b where b.id = p_board_id and b.created_by = auth.uid());
$$;

revoke all on function public.can_manage_board(uuid) from public, anon;
grant execute on function public.can_manage_board(uuid) to authenticated;

-- ── Projects ──
drop policy if exists "Project members can update boards" on public.project_boards;
drop policy if exists "Board owners can update boards" on public.project_boards;
create policy "Board owners can update boards" on public.project_boards for update to authenticated
  using (created_by = auth.uid() or public.is_workspace_admin())
  with check (created_by = auth.uid() or public.is_workspace_admin());

drop policy if exists "Project members can read boards" on public.project_boards;
create policy "Project members can read boards" on public.project_boards for select to authenticated
  using (created_by = auth.uid() or public.can_view_board(id));

-- ── Columns: everyone on the project can read them, only the owner can change them ──
drop policy if exists "Project members can manage columns" on public.project_columns;
drop policy if exists "Project members can read columns" on public.project_columns;
drop policy if exists "Board owners can add columns" on public.project_columns;
drop policy if exists "Board owners can update columns" on public.project_columns;
drop policy if exists "Board owners can delete columns" on public.project_columns;
create policy "Project members can read columns" on public.project_columns for select to authenticated
  using (public.can_view_board(board_id));
create policy "Board owners can add columns" on public.project_columns for insert to authenticated
  with check (public.can_manage_board(board_id));
create policy "Board owners can update columns" on public.project_columns for update to authenticated
  using (public.can_manage_board(board_id)) with check (public.can_manage_board(board_id));
create policy "Board owners can delete columns" on public.project_columns for delete to authenticated
  using (public.can_manage_board(board_id));

-- ── Tasks: only the people involved ──
-- created_by/assignee_id are checked directly as well, because a row inserted in the same
-- statement (insert ... returning) is not yet visible to the stable can_view_task().
drop policy if exists "Project members can read tasks" on public.project_tasks;
drop policy if exists "Project members can insert tasks" on public.project_tasks;
drop policy if exists "Project members can update tasks" on public.project_tasks;
drop policy if exists "Project members can delete tasks" on public.project_tasks;
drop policy if exists "Task members can read tasks" on public.project_tasks;
drop policy if exists "Task members can update tasks" on public.project_tasks;
drop policy if exists "Task owners can delete tasks" on public.project_tasks;
create policy "Task members can read tasks" on public.project_tasks for select to authenticated
  using (created_by = auth.uid() or assignee_id = auth.uid() or public.can_view_task(id));
create policy "Project members can insert tasks" on public.project_tasks for insert to authenticated
  with check (created_by = auth.uid() and public.can_view_board(board_id));
create policy "Task members can update tasks" on public.project_tasks for update to authenticated
  using (created_by = auth.uid() or assignee_id = auth.uid() or public.can_view_task(id))
  with check (public.can_view_board(board_id));
create policy "Task owners can delete tasks" on public.project_tasks for delete to authenticated
  using (created_by = auth.uid() or public.can_manage_board(board_id));

-- ── Task details follow the task ──
drop policy if exists "Authenticated users read task checklist" on public.project_task_checklist;
drop policy if exists "Authenticated users create task checklist" on public.project_task_checklist;
drop policy if exists "Authenticated users update task checklist" on public.project_task_checklist;
drop policy if exists "Authenticated users delete task checklist" on public.project_task_checklist;
drop policy if exists "Task members manage checklist" on public.project_task_checklist;
drop policy if exists "Task members add checklist items" on public.project_task_checklist;
create policy "Task members manage checklist" on public.project_task_checklist for all to authenticated
  using (public.can_view_task(task_id)) with check (public.can_view_task(task_id));

drop policy if exists "Authenticated users read task dependencies" on public.project_task_dependencies;
drop policy if exists "Task members read dependencies" on public.project_task_dependencies;
create policy "Task members read dependencies" on public.project_task_dependencies for select to authenticated
  using (public.can_view_task(task_id));

drop policy if exists "Authenticated users read task watchers" on public.project_task_watchers;
drop policy if exists "Task members read watchers" on public.project_task_watchers;
create policy "Task members read watchers" on public.project_task_watchers for select to authenticated
  using (user_id = auth.uid() or public.can_view_task(task_id));

drop policy if exists "Authenticated users read task collaborators" on public.project_task_collaborators;
drop policy if exists "Task members read collaborators" on public.project_task_collaborators;
create policy "Task members read collaborators" on public.project_task_collaborators for select to authenticated
  using (user_id = auth.uid() or public.can_view_task(task_id));

drop policy if exists "Authenticated users read milestones" on public.project_milestones;
drop policy if exists "Project members read milestones" on public.project_milestones;
create policy "Project members read milestones" on public.project_milestones for select to authenticated
  using (public.can_view_board(board_id));

drop policy if exists "Authenticated users read risks" on public.project_risks;
drop policy if exists "Project members read risks" on public.project_risks;
create policy "Project members read risks" on public.project_risks for select to authenticated
  using (public.can_view_board(board_id));

-- ── Messages: an edit cannot move a message into another channel ──
drop policy if exists "Users can edit their own messages" on public.messages;
create policy "Users can edit their own messages" on public.messages for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from public.channel_members cm where cm.channel_id = messages.channel_id and cm.user_id = auth.uid()));

-- Channels are created through create_channel(); direct inserts must be the caller's own non-DM channel.
drop policy if exists "Authenticated users can create channels" on public.channels;
create policy "Authenticated users can create channels" on public.channels for insert to authenticated
  with check (created_by = auth.uid() and type in ('public', 'private'));

-- ── Ideas: only the author (or an admin) can change or delete ──
drop policy if exists "Authenticated users can update ideas" on public.ideas;
drop policy if exists "Authenticated users can delete ideas" on public.ideas;
drop policy if exists "Authors can update ideas" on public.ideas;
drop policy if exists "Authors can delete ideas" on public.ideas;
create policy "Authors can update ideas" on public.ideas for update to authenticated
  using (author_id = auth.uid() or public.is_workspace_admin())
  with check (author_id = auth.uid() or public.is_workspace_admin());
create policy "Authors can delete ideas" on public.ideas for delete to authenticated
  using (author_id = auth.uid() or public.is_workspace_admin());

drop policy if exists "Authenticated users can delete idea comments" on public.idea_comments;
drop policy if exists "Authors can delete idea comments" on public.idea_comments;
create policy "Authors can delete idea comments" on public.idea_comments for delete to authenticated
  using (author_id = auth.uid() or public.is_workspace_admin());

-- ── Files: uploads only into the uploader's own folder ──
drop policy if exists "Authenticated users can upload" on storage.objects;
update storage.buckets set public = false where id = 'attachments';

commit;
