
create table if not exists public.apex_store_settings (
  setting_key text primary key check (setting_key = 'currency'),
  base_currency text not null default 'SAR' check (base_currency = 'SAR'),
  local_currency text not null default 'YER' check (local_currency = 'YER'),
  exchange_rate numeric(14,4) not null default 137 check (exchange_rate > 0 and exchange_rate <= 100000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.apex_store_settings enable row level security;
grant select on public.apex_store_settings to anon, authenticated;
grant insert, update on public.apex_store_settings to authenticated;
drop policy if exists "public can read currency settings" on public.apex_store_settings;
create policy "public can read currency settings"
on public.apex_store_settings for select to anon, authenticated
using (setting_key = 'currency');
drop policy if exists "admins insert currency settings" on public.apex_store_settings;
create policy "admins insert currency settings"
on public.apex_store_settings for insert to authenticated
with check (
  setting_key = 'currency'
  and exists (select 1 from public.apex_admins a where a.user_id = (select auth.uid()))
);
drop policy if exists "admins update currency settings" on public.apex_store_settings;
create policy "admins update currency settings"
on public.apex_store_settings for update to authenticated
using (
  setting_key = 'currency'
  and exists (select 1 from public.apex_admins a where a.user_id = (select auth.uid()))
)
with check (
  setting_key = 'currency'
  and exists (select 1 from public.apex_admins a where a.user_id = (select auth.uid()))
);
insert into public.apex_store_settings (setting_key, base_currency, local_currency, exchange_rate)
values ('currency', 'SAR', 'YER', 137)
on conflict (setting_key) do nothing;
