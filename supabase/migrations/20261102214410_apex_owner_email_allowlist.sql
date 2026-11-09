
create or replace function public.apex_register_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(new.email) = 'apex.1.shopping@gmail.com' then
    insert into public.apex_admins(user_id,email)
    values(new.id, lower(new.email))
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.apex_register_owner() from public, anon, authenticated;
drop trigger if exists apex_owner_after_signup on auth.users;
create trigger apex_owner_after_signup
after insert on auth.users
for each row execute function public.apex_register_owner();
