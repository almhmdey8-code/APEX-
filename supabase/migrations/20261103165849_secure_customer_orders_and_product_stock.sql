
alter table public.apex_products add column if not exists stock integer not null default 0 check (stock >= 0);
drop policy if exists "public can submit orders" on public.apex_orders;
create policy "customers submit own or guest orders" on public.apex_orders
for insert to anon, authenticated
with check (
  user_id is null OR
  (select auth.uid()) = user_id
);
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
