-- Server-only signup proofs. No password or plaintext verification code is stored.
begin;

create table if not exists public.signup_verification_challenges (
  email text primary key,
  display_name text not null,
  challenge_id uuid not null,
  code_hash text,
  expires_at timestamptz not null,
  state text not null check (state in ('pending', 'active', 'failed', 'consuming', 'consumed')),
  request_window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  last_requested_at timestamptz not null,
  attempt_window_started_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  lease_id uuid,
  lease_until timestamptz,
  check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@bytechsol[.]com$'),
  check (code_hash is null or code_hash ~ '^[0-9a-f]{64}$')
);
create index if not exists signup_verification_expiry_idx on public.signup_verification_challenges(expires_at);
alter table public.signup_verification_challenges enable row level security;
revoke all on public.signup_verification_challenges from public, anon, authenticated;
grant select, insert, update, delete on public.signup_verification_challenges to service_role;

create or replace function public.begin_signup_verification(
  p_email text, p_display_name text, p_challenge_id uuid, p_code_hash text
)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  challenge public.signup_verification_challenges;
  current_time_at timestamptz := clock_timestamp();
  request_start timestamptz;
  attempt_start timestamptz;
  requests integer;
  guesses integer;
begin
  if p_email is null or p_email <> lower(btrim(p_email)) or p_email !~ '^[^[:space:]@]+@bytechsol[.]com$'
    or p_display_name is null or char_length(btrim(p_display_name)) not between 2 and 160
    or p_challenge_id is null or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid signup verification request.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('signup:' || p_email)::bigint);
  select * into challenge from public.signup_verification_challenges where email = p_email for update;
  if found then
    if challenge.state = 'consuming' and challenge.lease_until > current_time_at then
      return jsonb_build_object('status', 'busy', 'retryAfterSeconds', greatest(1, ceil(extract(epoch from challenge.lease_until - current_time_at))::integer));
    end if;
    request_start := case when challenge.request_window_started_at > current_time_at - interval '15 minutes' then challenge.request_window_started_at else current_time_at end;
    requests := case when request_start = challenge.request_window_started_at then challenge.request_count else 0 end;
    attempt_start := case when challenge.attempt_window_started_at > current_time_at - interval '15 minutes' then challenge.attempt_window_started_at else current_time_at end;
    guesses := case when attempt_start = challenge.attempt_window_started_at then challenge.attempts else 0 end;
    if guesses >= 5 then
      return jsonb_build_object('status', 'locked', 'retryAfterSeconds', greatest(1, ceil(extract(epoch from attempt_start + interval '15 minutes' - current_time_at))::integer));
    end if;
    if requests >= 3 then
      return jsonb_build_object('status', 'rate_limited', 'retryAfterSeconds', greatest(1, ceil(extract(epoch from request_start + interval '15 minutes' - current_time_at))::integer));
    end if;
    if challenge.last_requested_at > current_time_at - interval '60 seconds' then
      return jsonb_build_object('status', 'cooldown', 'retryAfterSeconds', greatest(1, ceil(extract(epoch from challenge.last_requested_at + interval '60 seconds' - current_time_at))::integer));
    end if;
  else
    request_start := current_time_at;
    attempt_start := current_time_at;
    requests := 0;
    guesses := 0;
  end if;
  insert into public.signup_verification_challenges (email, display_name, challenge_id, code_hash, expires_at, state,
    request_window_started_at, request_count, last_requested_at, attempt_window_started_at, attempts)
  values (p_email, btrim(p_display_name), p_challenge_id, p_code_hash, current_time_at + interval '10 minutes', 'pending',
    request_start, requests + 1, current_time_at, attempt_start, guesses)
  on conflict (email) do update set display_name = excluded.display_name, challenge_id = excluded.challenge_id,
    code_hash = excluded.code_hash, expires_at = excluded.expires_at, state = 'pending',
    request_window_started_at = excluded.request_window_started_at, request_count = excluded.request_count,
    last_requested_at = excluded.last_requested_at, attempt_window_started_at = excluded.attempt_window_started_at,
    attempts = excluded.attempts, lease_id = null, lease_until = null;
  delete from public.signup_verification_challenges where email <> p_email
    and expires_at < current_time_at - interval '1 day' and request_window_started_at < current_time_at - interval '1 day'
    and (lease_until is null or lease_until < current_time_at);
  return jsonb_build_object('status', 'issued');
end;
$$;

create or replace function public.set_signup_verification_delivery(p_email text, p_challenge_id uuid, p_delivered boolean)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare challenge public.signup_verification_challenges;
begin
  select * into challenge from public.signup_verification_challenges where email = p_email for update;
  if not found or challenge.challenge_id <> p_challenge_id then return false; end if;
  if p_delivered and challenge.state = 'active' then return true; end if;
  if not p_delivered and challenge.state = 'failed' then return true; end if;
  if challenge.state <> 'pending' then return false; end if;
  if p_delivered and challenge.expires_at <= clock_timestamp() then return false; end if;
  update public.signup_verification_challenges set state = case when p_delivered then 'active' else 'failed' end,
    code_hash = case when p_delivered then code_hash else null end where email = p_email;
  return true;
end;
$$;

create or replace function public.claim_signup_verification(p_email text, p_code_hash text, p_lease_id uuid)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  challenge public.signup_verification_challenges;
  current_time_at timestamptz := clock_timestamp();
  guesses integer;
  attempt_start timestamptz;
begin
  if p_lease_id is null or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into challenge from public.signup_verification_challenges where email = p_email for update;
  if not found then return jsonb_build_object('status', 'expired'); end if;
  if challenge.state = 'consumed' then return jsonb_build_object('status', 'used'); end if;
  if challenge.expires_at <= current_time_at then return jsonb_build_object('status', 'expired'); end if;
  if challenge.state = 'consuming' and challenge.lease_until > current_time_at then
    return jsonb_build_object('status', 'busy', 'retryAfterSeconds', greatest(1, ceil(extract(epoch from challenge.lease_until - current_time_at))::integer));
  end if;
  if challenge.state not in ('active', 'consuming') then return jsonb_build_object('status', 'invalid'); end if;
  attempt_start := case when challenge.attempt_window_started_at > current_time_at - interval '15 minutes' then challenge.attempt_window_started_at else current_time_at end;
  guesses := case when attempt_start = challenge.attempt_window_started_at then challenge.attempts else 0 end;
  if guesses >= 5 then
    return jsonb_build_object('status', 'locked', 'retryAfterSeconds', greatest(1, ceil(extract(epoch from attempt_start + interval '15 minutes' - current_time_at))::integer));
  end if;
  update public.signup_verification_challenges set attempts = guesses + 1, attempt_window_started_at = attempt_start where email = p_email;
  if challenge.code_hash is distinct from p_code_hash then return jsonb_build_object('status', 'incorrect'); end if;
  update public.signup_verification_challenges set state = 'consuming', lease_id = p_lease_id,
    lease_until = current_time_at + interval '60 seconds' where email = p_email;
  return jsonb_build_object('status', 'claimed', 'email', p_email, 'challengeId', challenge.challenge_id, 'displayName', challenge.display_name);
end;
$$;

create or replace function public.complete_signup_verification(p_email text, p_challenge_id uuid, p_lease_id uuid, p_success boolean)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare challenge public.signup_verification_challenges;
begin
  select * into challenge from public.signup_verification_challenges where email = p_email for update;
  if not found or challenge.challenge_id <> p_challenge_id or challenge.lease_id is distinct from p_lease_id then return false; end if;
  if p_success and challenge.state = 'consumed' then return true; end if;
  if not p_success and challenge.state = 'active' then return true; end if;
  if challenge.state <> 'consuming' then return false; end if;
  update public.signup_verification_challenges set state = case when p_success then 'consumed' else 'active' end,
    code_hash = case when p_success then null else code_hash end, lease_until = null where email = p_email;
  return true;
end;
$$;

revoke all on function public.begin_signup_verification(text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.set_signup_verification_delivery(text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.claim_signup_verification(text, text, uuid) from public, anon, authenticated;
revoke all on function public.complete_signup_verification(text, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.begin_signup_verification(text, text, uuid, text) to service_role;
grant execute on function public.set_signup_verification_delivery(text, uuid, boolean) to service_role;
grant execute on function public.claim_signup_verification(text, text, uuid) to service_role;
grant execute on function public.complete_signup_verification(text, uuid, uuid, boolean) to service_role;
notify pgrst, 'reload schema';
commit;
