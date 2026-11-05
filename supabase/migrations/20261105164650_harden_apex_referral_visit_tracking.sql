-- Harden APEX referral visit tracking.
-- Applied to the linked Supabase project; this migration keeps the change reproducible.

create or replace function public.apex_track_referral_visit(
  p_code text,
  p_visitor_id text,
  p_landing_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner uuid;
  v_code text;
  v_visitor text;
  v_path text;
begin
  v_code := upper(trim(coalesce(p_code, '')));
  v_visitor := trim(coalesce(p_visitor_id, ''));
  v_path := left(coalesce(p_landing_path, ''), 300);

  if v_code !~ '^APEX[0-9]{4}$'
     or length(v_visitor) < 12
     or length(v_visitor) > 100
     or v_visitor !~ '^[A-Za-z0-9._:-]+$' then
    return jsonb_build_object('tracked', false, 'reason', 'invalid_input');
  end if;

  select c.user_id
    into v_owner
    from public.apex_referral_codes c
   where c.code = v_code;

  if v_owner is null or v_owner = auth.uid() then
    return jsonb_build_object('tracked', false, 'reason', 'invalid_or_self_referral');
  end if;

  -- One row per referral code and visitor ID; repeat visits refresh metadata only.
  insert into public.apex_referral_visits(
    referrer_id, code, visitor_id, landing_path, visit_count, first_seen_at, last_seen_at
  )
  values (v_owner, v_code, v_visitor, v_path, 1, now(), now())
  on conflict (code, visitor_id) do update
    set last_seen_at = now(),
        landing_path = excluded.landing_path;

  return jsonb_build_object('tracked', true);
end;
$function$;

revoke all on function public.apex_track_referral_visit(text, text, text) from public;
revoke all on function public.apex_track_referral_visit(text, text, text) from authenticated;
grant execute on function public.apex_track_referral_visit(text, text, text) to anon;
grant execute on function public.apex_track_referral_visit(text, text, text) to service_role;
