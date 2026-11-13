drop policy if exists "APEX admins require MFA AAL2" on public.apex_banners;
create policy "APEX admins require MFA AAL2"
on public.apex_banners
as restrictive
for all
to authenticated
using (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
)
with check (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
);

drop policy if exists "APEX admins require MFA AAL2" on public.apex_email_settings;
create policy "APEX admins require MFA AAL2"
on public.apex_email_settings
as restrictive
for all
to authenticated
using (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
)
with check (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
);

drop policy if exists "APEX admins require MFA AAL2" on public.apex_order_refunds;
create policy "APEX admins require MFA AAL2"
on public.apex_order_refunds
as restrictive
for all
to authenticated
using (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
)
with check (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
);

drop policy if exists "APEX admins require MFA AAL2" on public.apex_order_status_history;
create policy "APEX admins require MFA AAL2"
on public.apex_order_status_history
as restrictive
for all
to authenticated
using (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
)
with check (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
);

drop policy if exists "APEX admins require MFA AAL2" on public.apex_orders;
create policy "APEX admins require MFA AAL2"
on public.apex_orders
as restrictive
for all
to authenticated
using (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
)
with check (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
);

drop policy if exists "APEX admins require MFA AAL2" on public.apex_payment_methods;
create policy "APEX admins require MFA AAL2"
on public.apex_payment_methods
as restrictive
for all
to authenticated
using (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
)
with check (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
);

drop policy if exists "APEX admins require MFA AAL2" on public.apex_products;
create policy "APEX admins require MFA AAL2"
on public.apex_products
as restrictive
for all
to authenticated
using (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
)
with check (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
);

drop policy if exists "APEX admins require MFA AAL2" on public.apex_security_events;
create policy "APEX admins require MFA AAL2"
on public.apex_security_events
as restrictive
for all
to authenticated
using (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
)
with check (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
);

drop policy if exists "APEX admins require MFA AAL2" on public.apex_shipping_providers;
create policy "APEX admins require MFA AAL2"
on public.apex_shipping_providers
as restrictive
for all
to authenticated
using (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
)
with check (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
);

drop policy if exists "APEX admins require MFA AAL2" on public.apex_store_settings;
create policy "APEX admins require MFA AAL2"
on public.apex_store_settings
as restrictive
for all
to authenticated
using (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
)
with check (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
);

drop policy if exists "APEX admins require MFA AAL2" on public.apex_wallet_topups;
create policy "APEX admins require MFA AAL2"
on public.apex_wallet_topups
as restrictive
for all
to authenticated
using (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
)
with check (
 (select auth.jwt()->>'aal') = 'aal2'
 or not exists (select 1 from public.apex_admins a where a.user_id=(select auth.uid()))
);