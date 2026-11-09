
create unique index if not exists apex_orders_checkout_request_id_uidx
on public.apex_orders(checkout_request_id) where checkout_request_id is not null;

create or replace function public.apex_create_order_backend(
  p_user_id uuid,
  p_customer_name text,
  p_phone text,
  p_address text,
  p_notes text,
  p_items jsonb,
  p_shipping_method text,
  p_payment_method_id bigint,
  p_request_id uuid
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_method public.apex_payment_methods%rowtype;
  v_order_id bigint;
  v_items jsonb;
  v_total numeric(12,2);
begin
  if p_user_id is null
     or nullif(trim(p_customer_name),'') is null
     or nullif(trim(p_phone),'') is null
     or p_request_id is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 40 then
    raise exception 'بيانات الطلب غير مكتملة';
  end if;

  select * into v_method
  from public.apex_payment_methods
  where id = p_payment_method_id
    and enabled = true
    and orders_enabled = true
    and method_type = 'manual';
  if not found then raise exception 'وسيلة الدفع غير متاحة للطلبات'; end if;

  if exists (select 1 from public.apex_orders where checkout_request_id = p_request_id) then
    select id into v_order_id from public.apex_orders where checkout_request_id = p_request_id;
    return v_order_id;
  end if;

  with requested as (
    select (x->>'id')::bigint as product_id,
           greatest(1, least(20, coalesce((x->>'quantity')::integer,1))) as quantity
    from jsonb_array_elements(p_items) x
  ), aggregated as (
    select p.id, p.name, p.price, sum(r.quantity)::integer as quantity
    from requested r
    join public.apex_products p on p.id=r.product_id and p.active=true
    group by p.id,p.name,p.price
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',id,'name',name,'quantity',quantity,
           'unit_price_sar',price,'line_total_sar',round(price*quantity,2)
         ) order by id),'[]'::jsonb),
         coalesce(sum(round(price*quantity,2)),0)
    into v_items,v_total
  from aggregated;

  if jsonb_array_length(v_items) = 0 or v_total <= 0 then
    raise exception 'المنتجات غير متاحة أو أسعارها غير محددة';
  end if;

  insert into public.apex_orders(
    user_id, customer_name, phone, address, items, notes, status,
    total_sar, payment_method, payment_status, shipping_status,
    customer_currency, checkout_request_id
  ) values (
    p_user_id, left(trim(p_customer_name),160), left(trim(p_phone),40),
    left(coalesce(p_address,''),1000), v_items,
    left(coalesce(p_notes,'') || E'\nطريقة الشحن: ' || left(coalesce(p_shipping_method,''),100),1200),
    'new',v_total,v_method.name,'pending','order_received','SAR',p_request_id
  ) returning id into v_order_id;

  insert into public.apex_order_status_history(order_id,status,note,changed_by)
  values(v_order_id,'new','تم استلام الطلب وبانتظار تأكيد الدفع ومراجعة الإدارة',p_user_id);

  return v_order_id;
end;
$$;

revoke all on function public.apex_create_order_backend(uuid,text,text,text,text,jsonb,text,bigint,uuid) from public, anon, authenticated;
grant execute on function public.apex_create_order_backend(uuid,text,text,text,text,jsonb,text,bigint,uuid) to service_role;
