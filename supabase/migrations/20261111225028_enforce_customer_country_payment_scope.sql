CREATE OR REPLACE FUNCTION public.apex_create_order_backend(p_user_id uuid, p_customer_name text, p_phone text, p_address text, p_notes text, p_items jsonb, p_shipping_method text, p_payment_method_id bigint, p_request_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_method public.apex_payment_methods%rowtype;
  v_order_id bigint;
  v_items jsonb;
  v_total numeric(12,2);
  v_requested integer;
  v_count integer;
  v_country text;
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

  select case
    when lower(coalesce(u.raw_user_meta_data->>'country','')) in ('ye','yemen')
      or lower(coalesce(u.raw_user_meta_data->>'country','')) like '%اليمن%'
    then 'YE' else 'SA'
  end into v_country
  from auth.users u where u.id = p_user_id;
  v_country := coalesce(v_country,'SA');

  select * into v_method
  from public.apex_payment_methods
  where id = p_payment_method_id
    and enabled = true
    and orders_enabled = true
    and method_type = 'manual'
    and country_code in (v_country,'ALL');
  if not found then raise exception 'وسيلة الدفع غير متاحة للطلبات'; end if;

  perform pg_advisory_xact_lock(hashtextextended('apex-order:' || p_request_id::text, 0));

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

  perform private.apex_reserve_order_stock(p_items);

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
    left(coalesce(p_notes,'') || E'\nطريقة الشحن: ' || left(coalesce(p_shipping_method,''),100),1200),
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

CREATE OR REPLACE FUNCTION public.apex_request_wallet_topup(p_amount_sar numeric, p_payment_method_id bigint, p_customer_reference text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_method record;
  v_id bigint;
  v_country text;
begin
  if v_uid is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;
  select case
    when lower(coalesce(u.raw_user_meta_data->>'country','')) in ('ye','yemen')
      or lower(coalesce(u.raw_user_meta_data->>'country','')) like '%اليمن%'
    then 'YE' else 'SA'
  end into v_country
  from auth.users u where u.id = v_uid;
  v_country := coalesce(v_country,'SA');

  if p_amount_sar is null or p_amount_sar <= 0 or p_amount_sar <> round(p_amount_sar, 2) then
    raise exception 'أدخل مبلغاً صحيحاً بالريال السعودي';
  end if;

  select id, name, instructions, method_type, enabled, wallet_topup_enabled, gateway_provider
  into v_method
  from public.apex_payment_methods
  where id = p_payment_method_id and enabled = true and wallet_topup_enabled = true
    and country_code in (v_country,'ALL');

  if not found then
    raise exception 'وسيلة شحن المحفظة غير متاحة حالياً';
  end if;
  if v_method.method_type <> 'manual' then
    raise exception 'الدفع الإلكتروني لهذه الوسيلة غير مربوط بعد؛ اختر وسيلة تحويل يدوية معتمدة';
  end if;

  insert into public.apex_wallet_topups(
    user_id, amount_sar, payment_method_id, payment_method_name,
    payment_instructions, customer_reference, payment_method_type, gateway_provider
  ) values (
    v_uid, p_amount_sar, v_method.id, v_method.name,
    coalesce(v_method.instructions, ''),
    nullif(left(trim(coalesce(p_customer_reference, '')), 160), ''),
    v_method.method_type, v_method.gateway_provider
  )
  returning id into v_id;

  return v_id;
end;
$function$;

