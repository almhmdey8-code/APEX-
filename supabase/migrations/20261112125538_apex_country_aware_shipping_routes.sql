
-- APEX shipping routing: Saudi direct-to-customer; Yemen via APEX Riyadh hub.
alter table public.apex_orders
  add column if not exists delivery_country text not null default 'SA',
  add column if not exists supplier_delivery_address text,
  add column if not exists last_mile_delivery_address text,
  add column if not exists supplier_delivery_mode text not null default 'direct',
  add column if not exists shipping_route_status text not null default 'awaiting_supplier_order';

alter table public.apex_orders
  drop constraint if exists apex_orders_delivery_country_check;
alter table public.apex_orders
  add constraint apex_orders_delivery_country_check check (delivery_country in ('SA','YE'));

alter table public.apex_orders
  drop constraint if exists apex_orders_supplier_delivery_mode_check;
alter table public.apex_orders
  add constraint apex_orders_supplier_delivery_mode_check check (supplier_delivery_mode in ('direct','apex_riyadh_hub'));

create table if not exists public.apex_shipping_settings (
  id integer primary key default 1 check (id = 1),
  riyadh_warehouse_address text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.apex_shipping_settings enable row level security;
drop policy if exists apex_shipping_settings_admin_all on public.apex_shipping_settings;
create policy apex_shipping_settings_admin_all
on public.apex_shipping_settings for all to authenticated
using (exists (select 1 from public.apex_admins a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.apex_admins a where a.user_id = (select auth.uid())));
insert into public.apex_shipping_settings(id, riyadh_warehouse_address)
values (1, '')
on conflict (id) do nothing;
revoke all on public.apex_shipping_settings from anon, authenticated;
grant select, insert, update on public.apex_shipping_settings to authenticated;

create or replace function public.apex_create_order_backend_v2(
  p_user_id uuid,
  p_customer_name text,
  p_phone text,
  p_address text,
  p_delivery_country text,
  p_notes text,
  p_items jsonb,
  p_shipping_method text,
  p_payment_method_id bigint,
  p_request_id uuid
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_order_id bigint;
  v_supplier_address text;
  v_country text := upper(trim(coalesce(p_delivery_country,'')));
begin
  if v_country not in ('SA','YE') then raise exception 'دولة التوصيل غير مدعومة'; end if;
  if nullif(trim(coalesce(p_address,'')),'') is null then
    raise exception 'عنوان العميل مطلوب لتأكيد مسار الشحن';
  end if;
  if v_country = 'YE' then
    select nullif(trim(riyadh_warehouse_address),'')
      into v_supplier_address
      from public.apex_shipping_settings where id = 1;
    if v_supplier_address is null then
      raise exception 'لم يتم إعداد عنوان مستودع APEX في الرياض بعد؛ أضفه في إعدادات الشحن قبل استقبال طلبات اليمن';
    end if;
  else
    v_supplier_address := trim(p_address);
  end if;

  select id into v_order_id
    from public.apex_orders
    where user_id = p_user_id and checkout_request_id = p_request_id;
  if found then
    if exists (select 1 from public.apex_orders where id=v_order_id and delivery_country<>v_country) then
      raise exception 'معرّف الطلب مستخدم لمسار شحن مختلف';
    end if;
    return v_order_id;
  end if;

  v_order_id := public.apex_create_order_backend(
    p_user_id,p_customer_name,p_phone,p_address,p_notes,p_items,
    p_shipping_method,p_payment_method_id,p_request_id
  );
  update public.apex_orders
  set delivery_country = v_country,
      supplier_delivery_address = v_supplier_address,
      last_mile_delivery_address = case when v_country='YE' then trim(p_address) else null end,
      supplier_delivery_mode = case when v_country='YE' then 'apex_riyadh_hub' else 'direct' end,
      shipping_route_status = 'awaiting_supplier_order'
  where id = v_order_id;
  return v_order_id;
end;
$$;

create or replace function public.apex_wallet_checkout_backend_v2(
  p_user_id uuid,
  p_customer_name text,
  p_phone text,
  p_address text,
  p_delivery_country text,
  p_notes text,
  p_items jsonb,
  p_shipping_method text,
  p_request_id uuid
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_order_id bigint;
  v_supplier_address text;
  v_country text := upper(trim(coalesce(p_delivery_country,'')));
begin
  if v_country not in ('SA','YE') then raise exception 'دولة التوصيل غير مدعومة'; end if;
  if nullif(trim(coalesce(p_address,'')),'') is null then
    raise exception 'عنوان العميل مطلوب لتأكيد مسار الشحن';
  end if;
  if v_country = 'YE' then
    select nullif(trim(riyadh_warehouse_address),'')
      into v_supplier_address
      from public.apex_shipping_settings where id = 1;
    if v_supplier_address is null then
      raise exception 'لم يتم إعداد عنوان مستودع APEX في الرياض بعد؛ أضفه في إعدادات الشحن قبل استقبال طلبات اليمن';
    end if;
  else
    v_supplier_address := trim(p_address);
  end if;

  select id into v_order_id
    from public.apex_orders
    where user_id = p_user_id and checkout_request_id = p_request_id;
  if found then
    if exists (select 1 from public.apex_orders where id=v_order_id and delivery_country<>v_country) then
      raise exception 'معرّف الطلب مستخدم لمسار شحن مختلف';
    end if;
    return v_order_id;
  end if;

  v_order_id := public.apex_wallet_checkout_backend(
    p_user_id,p_customer_name,p_phone,p_address,p_notes,p_items,
    p_shipping_method,p_request_id
  );
  update public.apex_orders
  set delivery_country = v_country,
      supplier_delivery_address = v_supplier_address,
      last_mile_delivery_address = case when v_country='YE' then trim(p_address) else null end,
      supplier_delivery_mode = case when v_country='YE' then 'apex_riyadh_hub' else 'direct' end,
      shipping_route_status = 'awaiting_supplier_order'
  where id = v_order_id;
  return v_order_id;
end;
$$;

revoke all on function public.apex_create_order_backend_v2(uuid,text,text,text,text,text,jsonb,text,bigint,uuid) from public, anon, authenticated;
grant execute on function public.apex_create_order_backend_v2(uuid,text,text,text,text,text,jsonb,text,bigint,uuid) to service_role;
revoke all on function public.apex_wallet_checkout_backend_v2(uuid,text,text,text,text,text,jsonb,text,uuid) from public, anon, authenticated;
grant execute on function public.apex_wallet_checkout_backend_v2(uuid,text,text,text,text,text,jsonb,text,uuid) to service_role;
