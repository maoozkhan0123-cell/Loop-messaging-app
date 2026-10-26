-- Company member administration audit trail.
create table if not exists public.member_audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references public.profiles(id) on delete set null,
  target_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('invite', 'update', 'suspend', 'reactivate', 'password_reset', 'delete')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists member_audit_logs_target_created_idx
  on public.member_audit_logs (target_id, created_at desc);

alter table public.member_audit_logs enable row level security;

drop policy if exists "Admins can view member audit logs" on public.member_audit_logs;
create policy "Admins can view member audit logs"
  on public.member_audit_logs for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Writes intentionally use the server-only service key; clients cannot alter audit history.
