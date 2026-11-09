-- Enforce the existing company-email policy for new accounts and changed addresses.
-- Existing legacy accounts remain intact and can update unrelated Auth fields.
begin;

create or replace function public.enforce_company_email()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and lower(new.email) is not distinct from lower(old.email) then
    return new;
  end if;
  if new.email is null or new.email !~* '^[^[:space:]@]+@bytechsol[.]com$' then
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

commit;
