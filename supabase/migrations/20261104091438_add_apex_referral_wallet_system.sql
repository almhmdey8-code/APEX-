
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.apex_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_sar numeric(12,2) not null default 0 check (balance_sar >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.apex_wallet_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_sar numeric(12,2) not null,
  transaction_type text not null check (transaction_type in ('referral_reward','purchase','refund','admin_adjustment')),
  description text not null default '',
  reference_type text,
  reference_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists apex_wallet_referral_reward_once
  on public.apex_wallet_transactions(user_id, reference_type, reference_id)
  where transaction_type = 'referral_reward';

create table if not exists public.apex_referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^APEX[0-9]{4}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.apex_referral_signups (
  id bigint generated always as identity primary key,
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','confirmed')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  check (referrer_id <> referred_user_id)
);

create index if not exists apex_referral_signups_referrer_status
  on public.apex_referral_signups(referrer_id, status);

alter table public.apex_wallets enable row level security;
alter table public.apex_wallet_transactions enable row level security;
alter table public.apex_referral_codes enable row level security;
alter table public.apex_referral_signups enable row level security;

drop policy if exists "customers read own wallet" on public.apex_wallets;
create policy "customers read own wallet" on public.apex_wallets
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "customers read own wallet transactions" on public.apex_wallet_transactions;
create policy "customers read own wallet transactions" on public.apex_wallet_transactions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "customers read own referral code" on public.apex_referral_codes;
create policy "customers read own referral code" on public.apex_referral_codes
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "customers read own referral activity" on public.apex_referral_signups;
create policy "customers read own referral activity" on public.apex_referral_signups
  for select to authenticated using (
    referrer_id = (select auth.uid()) or referred_user_id = (select auth.uid())
  );

grant select on public.apex_wallets, public.apex_wallet_transactions,
  public.apex_referral_codes, public.apex_referral_signups to authenticated;

create or replace function private.apex_initialize_customer_rewards()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_referrer uuid;
  v_inserted integer;
begin
  insert into public.apex_wallets(user_id) values (new.id)
  on conflict (user_id) do nothing;

  if not exists (select 1 from public.apex_referral_codes where user_id = new.id) then
    loop
      v_code := 'APEX' || lpad(floor(random() * 10000)::integer::text, 4, '0');
      insert into public.apex_referral_codes(user_id, code)
      values (new.id, v_code)
      on conflict do nothing;
      get diagnostics v_inserted = row_count;
      exit when v_inserted = 1;
    end loop;
  end if;

  v_code := upper(trim(coalesce(new.raw_user_meta_data->>'referral_code','')));
  if v_code <> '' then
    select user_id into v_referrer
    from public.apex_referral_codes
    where code = v_code
    limit 1;

    if v_referrer is not null and v_referrer <> new.id then
      insert into public.apex_referral_signups(referrer_id, referred_user_id)
      values (v_referrer, new.id)
      on conflict (referred_user_id) do nothing;
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.apex_confirm_referral_and_reward()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referrer uuid;
  v_count integer;
  v_paid integer;
  v_milestone integer;
  v_tx_id bigint;
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.apex_referral_signups
    set status = 'confirmed', confirmed_at = now()
    where referred_user_id = new.id and status = 'pending'
    returning referrer_id into v_referrer;

    if v_referrer is not null then
      insert into public.apex_wallets(user_id) values (v_referrer)
      on conflict (user_id) do nothing;

      select count(*)::integer into v_count
      from public.apex_referral_signups
      where referrer_id = v_referrer and status = 'confirmed';

      select balance_sar into v_paid
      from public.apex_wallets
      where user_id = v_referrer
      for update;

      v_milestone := 1;
      while v_milestone <= floor(v_count / 5.0)::integer loop
        insert into public.apex_wallet_transactions(
          user_id, amount_sar, transaction_type, description, reference_type, reference_id
        )
        values (
          v_referrer, 50, 'referral_reward',
          'مكافأة دعوة 5 عملاء مكتملين', 'referral_milestone', v_milestone::text
        )
        on conflict do nothing
        returning id into v_tx_id;

        if v_tx_id is not null then
          update public.apex_wallets
          set balance_sar = balance_sar + 50, updated_at = now()
          where user_id = v_referrer;
        end if;

        v_tx_id := null;
        v_milestone := v_milestone + 1;
      end loop;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.apex_initialize_customer_rewards() from public, anon, authenticated;
revoke all on function private.apex_confirm_referral_and_reward() from public, anon, authenticated;

drop trigger if exists apex_initialize_customer_rewards on auth.users;
create trigger apex_initialize_customer_rewards
after insert on auth.users
for each row execute function private.apex_initialize_customer_rewards();

drop trigger if exists apex_confirm_referral_and_reward on auth.users;
create trigger apex_confirm_referral_and_reward
after update of email_confirmed_at on auth.users
for each row execute function private.apex_confirm_referral_and_reward();

-- Backfill wallets and unique invitation codes for existing accounts.
insert into public.apex_wallets(user_id)
select id from auth.users
on conflict (user_id) do nothing;

do $$
declare
  u record;
  v_code text;
  v_inserted integer;
begin
  for u in select id from auth.users where id not in (select user_id from public.apex_referral_codes)
  loop
    loop
      v_code := 'APEX' || lpad(floor(random() * 10000)::integer::text, 4, '0');
      insert into public.apex_referral_codes(user_id, code)
      values (u.id, v_code)
      on conflict do nothing;
      get diagnostics v_inserted = row_count;
      exit when v_inserted = 1;
    end loop;
  end loop;
end;
$$;
