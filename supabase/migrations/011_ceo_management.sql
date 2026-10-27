-- CEO command center support. The authoritative role remains auth.users.app_metadata.role.
-- Assign it through the existing server-side member administration API, never from a client update.

create table if not exists public.executive_audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists executive_audit_created_idx on public.executive_audit_logs(created_at desc);
create index if not exists executive_audit_entity_idx on public.executive_audit_logs(entity_type, entity_id, created_at desc);
alter table public.executive_audit_logs enable row level security;

create or replace function public.is_ceo()
returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'ceo';
$$;
revoke all on function public.is_ceo() from public, anon;
grant execute on function public.is_ceo() to authenticated;

create policy "CEOs can read executive audit history" on public.executive_audit_logs
  for select to authenticated using (public.is_ceo());
-- Writes are service-role only through protected server APIs.

-- CEO management access uses the same shared project/task data as employees.
create policy "CEOs can manage project boards" on public.project_boards for all to authenticated
  using (public.is_ceo()) with check (public.is_ceo());
create policy "CEOs can manage project columns" on public.project_columns for all to authenticated
  using (public.is_ceo()) with check (public.is_ceo());
create policy "CEOs can manage project tasks" on public.project_tasks for all to authenticated
  using (public.is_ceo()) with check (public.is_ceo());
create policy "CEOs can manage task comments" on public.project_task_comments for all to authenticated
  using (public.is_ceo()) with check (public.is_ceo());

comment on function public.is_ceo() is 'Checks the trusted Supabase Auth app_metadata role claim. Client metadata and local storage are ignored.';
