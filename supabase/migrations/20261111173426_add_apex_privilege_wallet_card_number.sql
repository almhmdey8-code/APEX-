create sequence if not exists public.apex_wallet_card_number_seq
  as bigint minvalue 1000000000 maxvalue 9999999999 start with 1000000000 increment by 1 no cycle;

alter table public.apex_wallets
  add column if not exists card_number text;

alter table public.apex_wallets
  alter column card_number set default nextval('public.apex_wallet_card_number_seq'::regclass)::text;

update public.apex_wallets
set card_number = nextval('public.apex_wallet_card_number_seq'::regclass)::text
where card_number is null;

alter table public.apex_wallets
  alter column card_number set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.apex_wallets'::regclass
      and conname = 'apex_wallets_card_number_key'
  ) then
    alter table public.apex_wallets
      add constraint apex_wallets_card_number_key unique (card_number);
  end if;
end $$;

comment on column public.apex_wallets.card_number is 'Unique 10-digit APEX Privilege digital wallet card identifier. Not a payment credential.';
