
alter table public.apex_security_events
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by uuid references auth.users(id) on delete set null;

create or replace function public.apex_ack_security_event(p_event_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from public.apex_admins a
    where a.user_id = v_uid
      and lower(a.email) = lower(coalesce(auth.jwt() ->> 'email',''))
      and lower(a.email) = 'apex.1.shopping@gmail.com'
  ) then
    raise exception 'غير مصرح';
  end if;

  update public.apex_security_events
  set acknowledged_at = now(), acknowledged_by = v_uid
  where id = p_event_id and acknowledged_at is null;

  return found;
end;
$$;

revoke all on function public.apex_ack_security_event(bigint) from public, anon;
grant execute on function public.apex_ack_security_event(bigint) to authenticated;
