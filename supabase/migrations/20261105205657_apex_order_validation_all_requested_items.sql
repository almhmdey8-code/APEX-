-- Validate every requested line before creating a manual or wallet order.
-- Prevent partial orders when a product is inactive or has no valid price,
-- and prevent repeated product IDs from bypassing the per-product quantity cap.

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
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_method public.apex_payment_methods%rowtype;
  v_order_id bigint;
  v_items jsonb;
  v_total numeric(12,2);
  v_requested integer;
  v_count integer;
begin
  if p_user_id is null
     or nullif(trim(p_customer_name),'') is null
     or nullif(trim(p_phone),'') is null
     or p_request_id is null
     or p_items is null
     or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 40 then
    raise exception 'بيانات الطلب غير مكتملة';
  end if;

  if exists (
    select 1
    from (
      select (x->>'id')::bigint as product_id,
             sum(greatest(1, least(20, coalesce((x->>'quantity')::integer,1))))::integer as quantity
      from jsonb_array_elements(p_items) x
      group by (x->>'id')::bigint
    ) requested
    where requested.quantity > 20
  ) then
    raise exception 'الحد الأقصى لكل منتج هو 20 قطعة';
  end if;

  select * into v_method
  from public.apex_payment_methods
  where id = p_payment_method_id
    and enabled = true
    and orders_enabled = true
    and method_type = 'manual';
  if not found then raise exception 'وسيلة الدفع غير متاحة للطلبات'; end if;

  if exists (select 1 from public.apex_orders where checkout_request_id = p_request_id) then
    select id into v_order_id
    from public.apex_orders
    where checkout_request_id = p_request_id;
    return v_order_id;
  end if;

  select count(distinct (x->>'id')::bigint)
  into v_requested
  from jsonb_array_elements(p_items) x;

  with requested as (
    select (x->>'id')::bigint as product_id,
           greatest(1, least(20, coalesce((x->>'quantity')::integer,1))) as quantity
    from jsonb_array_elements(p_items) x
  ),
  grouped as (
    select product_id, sum(quantity)::integer as quantity
    from requested
    group by product_id
  ),
  aggregated as (
    select p.id, p.name, p.price, g.quantity
    from grouped g
    join public.apex_products p
      on p.id = g.product_id
     and p.active = true
     and p.price is not null
     and p.price > 0
  )
  select count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'id',id,
           'name',name,
           'quantity',quantity,
           'unit_price_sar',price,
           'line_total_sar',round(price*quantity,2)
         ) order by id),'[]'::jsonb),
         coalesce(sum(round(price*quantity,2)),0)
    into v_count,v_items,v_total
  from aggregated;

  if v_count <> v_requested or jsonb_array_length(v_items) <> v_requested or v_total <= 0 then
    raise exception 'أحد المنتجات غير متاح أو لا يملك سعراً صالحاً؛ لم يتم إنشاء الطلب';
  end if;

  insert into public.apex_orders(
    user_id, customer_name, phone, address, items, notes, status,
    total_sar, payment_method, payment_status, shipping_status,
    customer_currency, checkout_request_id
  ) values (
    p_user_id,
    left(trim(p_customer_name),160),
    left(trim(p_phone),40),
    left(coalesce(p_address,''),1000),
    v_items,
    left(coalesce(p_notes,'') || E'\\nطريقة الشحن: ' || left(coalesce(p_shipping_method,''),100),1200),
    'new',
    v_total,
    v_method.name,
    'pending',
    'order_received',
    'SAR',
    p_request_id
  ) returning id into v_order_id;

  insert into public.apex_order_status_history(order_id,status,note,changed_by)
  values(v_order_id,'new','تم استلام الطلب وبانتظار تأكيد الدفع ومراجعة الإدارة',p_user_id);

  return v_order_id;
end;
$function$;

create or replace function public.apex_wallet_checkout_backend(
  p_user_id uuid,
  p_customer_name text,
  p_phone text,
  p_address text,
  p_notes text,
  p_items jsonb,
  p_shipping_method text,
  p_request_id uuid
)
returns bigint
language plpgsql
set search_path = ''
as $function$
declare
  v_total numeric(14,2);
  v_order_id bigint;
  v_lines jsonb;
  v_count integer;
  v_requested integer;
begin
  if p_user_id is null or p_request_id is null then
    raise exception 'بيانات الشراء غير مكتملة';
  end if;

  select id into v_order_id
  from public.apex_orders
  where user_id=p_user_id and checkout_request_id=p_request_id;
  if found then return v_order_id; end if;

  if coalesce(trim(p_customer_name),'')='' or coalesce(trim(p_phone),'')='' then
    raise exception 'الاسم ورقم الجوال مطلوبان';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>40 then
    raise exception 'السلة غير صالحة';
  end if;

  if exists (
    select 1
    from (
      select (x->>'id')::bigint as product_id,
             sum(greatest(1,least(20,coalesce((x->>'quantity')::integer,1))))::integer as quantity
      from jsonb_array_elements(p_items) x
      group by (x->>'id')::bigint
    ) requested
    where requested.quantity > 20
  ) then
    raise exception 'الحد الأقصى لكل منتج هو 20 قطعة';
  end if;

  select count(distinct (x->>'id')::bigint)
  into v_requested
  from jsonb_array_elements(p_items) x;

  with requested as (
    select (x->>'id')::bigint as product_id,
           greatest(1,least(20,coalesce((x->>'quantity')::integer,1))) as quantity
    from jsonb_array_elements(p_items) x
  ),
  grouped as (
    select product_id,sum(quantity)::integer as quantity
    from requested
    group by product_id
  )
  select count(*)::integer,
         coalesce(sum(p.price*g.quantity),0),
         coalesce(jsonb_agg(jsonb_build_object(
           'id',p.id,
           'name',p.name,
           'quantity',g.quantity,
           'unit_price_sar',p.price,
           'line_total_sar',round(p.price*g.quantity,2)
         ) order by p.id),'[]'::jsonb)
    into v_count,v_total,v_lines
  from grouped g
  join public.apex_products p
    on p.id=g.product_id
   and p.active=true
   and p.price is not null
   and p.price>0;

  if v_count<>v_requested or jsonb_array_length(v_lines)<>v_requested or v_total<=0 then
    raise exception 'منتج غير متاح أو لا يملك سعراً صالحاً؛ لم يتم الخصم أو إنشاء الطلب';
  end if;

  insert into public.apex_wallets(user_id,balance_sar)
  values(p_user_id,0)
  on conflict(user_id) do nothing;

  perform 1 from public.apex_wallets where user_id=p_user_id for update;
  if (select balance_sar from public.apex_wallets where user_id=p_user_id)<v_total then
    raise exception 'رصيد المحفظة غير كافٍ';
  end if;

  update public.apex_wallets
  set balance_sar=balance_sar-v_total,updated_at=now()
  where user_id=p_user_id;

  insert into public.apex_orders(
    user_id,customer_name,phone,address,items,notes,status,total_sar,
    payment_method,payment_status,shipping_status,checkout_request_id
  ) values(
    p_user_id,
    left(trim(p_customer_name),160),
    left(trim(p_phone),40),
    left(coalesce(p_address,''),1000),
    v_lines,
    left(coalesce(p_notes,'')||E'\\nطريقة الدفع: محفظة APEX\\nطريقة الشحن: '||coalesce(p_shipping_method,''),1200),
    'new',
    v_total,
    'wallet',
    'paid',
    'order_received',
    p_request_id
  ) returning id into v_order_id;

  insert into public.apex_wallet_transactions(
    user_id,amount_sar,transaction_type,description,reference_type,reference_id
  ) values(
    p_user_id,v_total,'purchase','شراء الطلب رقم #'||v_order_id,'order',v_order_id::text
  );

  insert into public.apex_order_status_history(order_id,status,note,changed_by)
  values(v_order_id,'new','تم استلام الطلب والدفع من محفظة APEX',p_user_id);

  return v_order_id;
end;
$function$;
