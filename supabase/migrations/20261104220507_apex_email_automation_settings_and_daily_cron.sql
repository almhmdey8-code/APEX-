create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.apex_email_settings (
  id integer primary key default 1 check (id = 1),
  daily_security_report_enabled boolean not null default false,
  marketing_campaigns_enabled boolean not null default true,
  report_hours integer not null default 24 check (report_hours between 1 and 168),
  updated_at timestamptz not null default now()
);
insert into public.apex_email_settings (id) values (1) on conflict (id) do nothing;
alter table public.apex_email_settings enable row level security;
drop policy if exists "APEX admins manage email settings" on public.apex_email_settings;
create policy "APEX admins manage email settings" on public.apex_email_settings
for all to authenticated
using (exists (select 1 from public.apex_admins a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.apex_admins a where a.user_id = (select auth.uid())));
grant select, insert, update on public.apex_email_settings to authenticated;
grant all on public.apex_email_settings to service_role;

create table if not exists public.apex_email_cron_auth (
  id integer primary key default 1 check (id = 1),
  secret_sha256 text not null
);
alter table public.apex_email_cron_auth enable row level security;
revoke all on public.apex_email_cron_auth from anon, authenticated;
grant select on public.apex_email_cron_auth to service_role;

do $$
declare v_secret text;
begin
  if not exists (select 1 from vault.secrets where name = 'apex_cron_secret') then
    v_secret := encode(gen_random_bytes(32), 'hex');
    perform vault.create_secret(v_secret, 'apex_cron_secret', 'APEX scheduled email job authorization');
    insert into public.apex_email_cron_auth(id, secret_sha256)
    values (1, encode(sha256(convert_to(v_secret, 'UTF8')), 'hex'))
    on conflict (id) do update set secret_sha256 = excluded.secret_sha256;
  end if;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'apex-daily-security-report';
select cron.schedule(
  'apex-daily-security-report',
  '0 6 * * *',
  $job$
    select net.http_post(
      url := 'https://ulzxdvtzziydhuvennzw.supabase.co/functions/v1/apex-ai-guard',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-apex-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'apex_cron_secret')
      ),
      body := '{"action":"scheduled_report","hours":24}'::jsonb,
      timeout_milliseconds := 15000
    );
  $job$
);