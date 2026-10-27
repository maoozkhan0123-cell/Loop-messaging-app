-- Executive operations: shared task planning, blockers, milestones, risks and workload capacity.
-- Apply after 011_ceo_management.sql.

alter table public.project_tasks add column if not exists start_date timestamptz;
alter table public.project_tasks add column if not exists estimated_hours numeric(8,2) check (estimated_hours is null or estimated_hours >= 0);
alter table public.project_tasks add column if not exists blocked_reason text;
alter table public.project_tasks add column if not exists archived_at timestamptz;
alter table public.project_tasks add column if not exists version integer not null default 1;

alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists manager_id uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists weekly_capacity_hours numeric(6,2) check (weekly_capacity_hours is null or weekly_capacity_hours > 0);

create table if not exists public.project_milestones (
  id uuid primary key default uuid_generate_v4(),
  board_id uuid not null references public.project_boards(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text,
  target_date timestamptz not null,
  owner_id uuid references public.profiles(id) on delete set null,
  status text not null default 'planned' check (status in ('planned','in_progress','completed','at_risk')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_risks (
  id uuid primary key default uuid_generate_v4(),
  board_id uuid not null references public.project_boards(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  description text,
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  probability text not null default 'possible' check (probability in ('unlikely','possible','likely')),
  mitigation text,
  owner_id uuid references public.profiles(id) on delete set null,
  review_date timestamptz,
  status text not null default 'open' check (status in ('open','mitigating','resolved','accepted')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_task_dependencies (
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.project_tasks(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create table if not exists public.project_task_collaborators (
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'collaborator' check (role in ('collaborator','reviewer','watcher')),
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index if not exists milestones_board_date_idx on public.project_milestones(board_id, target_date);
create index if not exists risks_board_status_idx on public.project_risks(board_id, status, severity);
create index if not exists task_dependencies_task_idx on public.project_task_dependencies(task_id);
create index if not exists task_collaborators_user_idx on public.project_task_collaborators(user_id);
create index if not exists project_tasks_active_due_idx on public.project_tasks(archived_at, due_date);

alter table public.project_milestones enable row level security;
alter table public.project_risks enable row level security;
alter table public.project_task_dependencies enable row level security;
alter table public.project_task_collaborators enable row level security;

create policy "Authenticated users read milestones" on public.project_milestones for select to authenticated using (true);
create policy "CEOs manage milestones" on public.project_milestones for all to authenticated using (public.is_ceo()) with check (public.is_ceo());
create policy "Authenticated users read risks" on public.project_risks for select to authenticated using (true);
create policy "CEOs manage risks" on public.project_risks for all to authenticated using (public.is_ceo()) with check (public.is_ceo());
create policy "Authenticated users read task dependencies" on public.project_task_dependencies for select to authenticated using (true);
create policy "CEOs manage task dependencies" on public.project_task_dependencies for all to authenticated using (public.is_ceo()) with check (public.is_ceo());
create policy "Authenticated users read task collaborators" on public.project_task_collaborators for select to authenticated using (true);
create policy "CEOs manage task collaborators" on public.project_task_collaborators for all to authenticated using (public.is_ceo()) with check (public.is_ceo());

comment on column public.project_tasks.version is 'Incremented by protected update APIs for optimistic concurrency checks.';
comment on column public.profiles.weekly_capacity_hours is 'Optional planning capacity; never interpreted as a productivity score.';
