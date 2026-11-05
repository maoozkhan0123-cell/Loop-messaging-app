-- Only @bytechsol.com addresses can have an account.
-- Enforced on auth.users itself, so it also covers direct Auth API calls, magic links and admin invites.
-- Safe to run more than once.

create or replace function public.enforce_company_email()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.email is null or lower(new.email) not like '%@bytechsol.com' then
    raise exception 'Only @bytechsol.com email addresses can join this workspace.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists auth_users_company_email on auth.users;
create trigger auth_users_company_email
  before insert or update of email on auth.users
  for each row execute function public.enforce_company_email();
