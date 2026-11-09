
create table if not exists public.apex_security_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in (
    'login_success','login_failed','signup_attempt','duplicate_account',
    'payment_pending','payment_verified','payment_rejected','payment_duplicate',
    'suspicious_activity','access_denied','rate_limited','admin_action'
  )),
  severity text not null default 'info' check (severity in ('info','warning','high','critical')),
  user_id uuid references auth.users(id) on delete set null,
  email_hash text,
  ip_hash text,
  user_agent text not null default '',
  source text not null default 'storefront',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists apex_security_events_created_idx on public.apex_security_events(created_at desc);
create index if not exists apex_security_events_type_idx on public.apex_security_events(event_type, created_at desc);
create index if not exists apex_security_events_user_idx on public.apex_security_events(user_id, created_at desc) where user_id is not null;
alter table public.apex_security_events enable row level security;
drop policy if exists "apex admins read security events" on public.apex_security_events;
create policy "apex admins read security events" on public.apex_security_events
for select to authenticated using (
  exists (select 1 from public.apex_admins a where a.user_id = auth.uid())
);
revoke all on public.apex_security_events from anon, authenticated;
grant select on public.apex_security_events to authenticated;
