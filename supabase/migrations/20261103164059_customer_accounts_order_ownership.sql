alter table public.apex_orders add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists apex_orders_user_id_created_at_idx on public.apex_orders(user_id, created_at desc);
drop policy if exists "customers view own orders" on public.apex_orders;
create policy "customers view own orders" on public.apex_orders for select to authenticated using ((select auth.uid()) = user_id);