-- APEX inventory reservation and recovery hardening.

CREATE OR REPLACE FUNCTION private.apex_reserve_order_stock(p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_requested integer; v_updated integer; v_product_id bigint;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items)=0 OR jsonb_array_length(p_items)>40 THEN
    RAISE EXCEPTION 'قائمة المنتجات غير صالحة';
  END IF;
  FOR v_product_id IN
    SELECT (x->>'id')::bigint FROM jsonb_array_elements(p_items) x
    GROUP BY (x->>'id')::bigint ORDER BY (x->>'id')::bigint
  LOOP
    PERFORM 1 FROM public.apex_products WHERE id=v_product_id FOR UPDATE;
  END LOOP;
  WITH requested AS (
    SELECT (x->>'id')::bigint AS product_id,
           SUM((x->>'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(p_items) x GROUP BY (x->>'id')::bigint
  )
  UPDATE public.apex_products p
     SET stock=p.stock-r.quantity,updated_at=now()
    FROM requested r
   WHERE p.id=r.product_id AND p.active=true AND p.price IS NOT NULL
     AND p.price>0 AND p.stock>=r.quantity;
  GET DIAGNOSTICS v_updated=ROW_COUNT;
  SELECT count(*)::integer INTO v_requested
  FROM (SELECT (x->>'id')::bigint FROM jsonb_array_elements(p_items) x GROUP BY (x->>'id')::bigint) q;
  IF v_updated<>v_requested THEN
    RAISE EXCEPTION 'الكمية المطلوبة غير متوفرة حالياً؛ لم يتم إنشاء الطلب أو خصم الرصيد';
  END IF;
  RETURN v_updated;
END;
$function$;
REVOKE ALL ON FUNCTION private.apex_reserve_order_stock(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.apex_reserve_order_stock(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION private.apex_restore_order_stock(p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_updated integer;
BEGIN
  WITH returned AS (
    SELECT (x->>'id')::bigint AS product_id,
           SUM((x->>'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    GROUP BY (x->>'id')::bigint
  )
  UPDATE public.apex_products p SET stock=p.stock+r.quantity,updated_at=now()
  FROM returned r WHERE p.id=r.product_id;
  GET DIAGNOSTICS v_updated=ROW_COUNT;
  RETURN v_updated;
END;
$function$;
REVOKE ALL ON FUNCTION private.apex_restore_order_stock(jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.apex_restore_stock_on_order_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status='cancelled' THEN
    PERFORM private.apex_restore_order_stock(OLD.items);
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.apex_restore_stock_on_order_cancel() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS apex_order_restore_stock_on_cancel ON public.apex_orders;
CREATE TRIGGER apex_order_restore_stock_on_cancel AFTER UPDATE OF status ON public.apex_orders
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status='cancelled')
EXECUTE FUNCTION private.apex_restore_stock_on_order_cancel();

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
CREATE OR REPLACE FUNCTION public.apex_wallet_checkout_backend(p_user_id uuid, p_customer_name text, p_phone text, p_address text, p_notes text, p_items jsonb, p_shipping_method text, p_request_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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

  perform pg_advisory_xact_lock(hashtextextended('apex-order:' || p_request_id::text, 0));

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

  perform private.apex_reserve_order_stock(p_items);

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

  perform set_config('apex.payment_verification_context','wallet_checkout_verified',true);

  insert into public.apex_orders(
    user_id,customer_name,phone,address,items,notes,status,total_sar,
    payment_method,payment_status,shipping_status,checkout_request_id
  ) values(
    p_user_id,
    left(trim(p_customer_name),160),
    left(trim(p_phone),40),
    left(coalesce(p_address,''),1000),
    v_lines,
    left(coalesce(p_notes,'')||E'\nطريقة الدفع: محفظة APEX\nطريقة الشحن: '||coalesce(p_shipping_method,''),1200),
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
CREATE OR REPLACE FUNCTION private.apex_guard_order_status_and_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_new_paid boolean;
  v_old_paid boolean;
  v_context text;
begin
  v_new_paid := lower(coalesce(new.payment_status,'pending')) in ('paid','succeeded','completed','verified');
  v_old_paid := case when tg_op='UPDATE' then lower(coalesce(old.payment_status,'pending')) in ('paid','succeeded','completed','verified') else false end;
  v_context := coalesce(current_setting('apex.payment_verification_context',true),'');

  if tg_op='INSERT' then
    if (v_new_paid and not (new.payment_method = 'wallet' and v_context = 'wallet_checkout_verified'))
       or coalesce(new.status,'new') not in ('new')
       or coalesce(new.shipping_status,'order_received') not in ('order_received','pending','') then
      raise exception 'يجب إنشاء الطلب بانتظار الدفع ولا يمكن إنشاء طلب مدفوع أو مشحون مباشرة';
    end if;
    return new;
  end if;

  if not v_old_paid and v_new_paid and v_context not in ('manual_admin_verified','gateway_verified') then
    raise exception 'لا يمكن اعتماد الدفع مباشرة؛ استخدم مسار التحقق الآمن';
  end if;

  if new.status='cancelled'
     and old.status is distinct from 'cancelled'
     and v_old_paid then
    raise exception 'لا يمكن إلغاء طلب مدفوع قبل تنفيذ الاسترداد الآمن';
  end if;

  if (
      (new.status in ('confirmed','processing','shipped','delivered') and new.status is distinct from old.status)
      or
      (new.shipping_status in ('approved','preparing','in_transit','delivered') and new.shipping_status is distinct from old.shipping_status)
     ) and not v_new_paid then
    raise exception 'ممنوع تأكيد أو تجهيز أو شحن أو تسليم طلب قبل التحقق من الدفع واعتماده';
  end if;

  if new.status is distinct from old.status then
    if new.status='confirmed' and old.status <> 'new' then
      raise exception 'يجب تأكيد الطلب أولاً قبل الانتقال إلى التجهيز';
    elsif new.status='processing' and old.status <> 'confirmed' then
      raise exception 'يجب تأكيد الطلب قبل بدء التجهيز';
    elsif new.status='shipped' and old.status <> 'processing' then
      raise exception 'يجب تجهيز الطلب قبل تسجيل شحنه';
    elsif new.status='delivered' then
      if coalesce(new.notes,'') ilike '%طريقة الشحن: استلام بالتنسيق مع المتجر%' then
        if old.status not in ('processing','shipped') then
          raise exception 'يجب تجهيز طلب الاستلام قبل تأكيد تسليمه';
        end if;
      elsif old.status <> 'shipped' then
        raise exception 'لا يمكن تأكيد التسليم قبل تسجيل الشحن';
      end if;
    end if;
  end if;

  if (new.status='new' and coalesce(new.shipping_status,'order_received') not in ('order_received','pending',''))
     or (new.status='confirmed' and coalesce(new.shipping_status,'') <> 'approved')
     or (new.status='processing' and coalesce(new.shipping_status,'') <> 'preparing')
     or (new.status='shipped' and coalesce(new.shipping_status,'') <> 'in_transit')
     or (new.status='delivered' and coalesce(new.shipping_status,'') <> 'delivered')
     or (new.status='cancelled' and coalesce(new.shipping_status,'cancelled') not in ('cancelled','order_received','pending')) then
    raise exception 'حالة الشحن لا تتوافق مع حالة الطلب؛ أعد تحديثهما معاً';
  end if;

  if new.status in ('shipped','delivered')
     and coalesce(new.notes,'') not ilike '%طريقة الشحن: استلام بالتنسيق مع المتجر%'
     and (nullif(trim(new.carrier),'') is null or nullif(trim(new.aramex_tracking_number),'') is null) then
    raise exception 'لا يمكن تسجيل الشحن أو التسليم دون شركة الشحن ورقم التتبع';
  end if;

  if new.status is distinct from old.status then
    insert into public.apex_order_status_history(order_id,status,note,changed_by)
    values (
      new.id,
      new.status,
      case new.status
        when 'new' then 'عاد الطلب إلى انتظار مراجعة الدفع'
        when 'confirmed' then 'تم تأكيد الطلب بعد اعتماد الدفع'
        when 'processing' then 'بدأ تجهيز الطلب بعد اعتماد الدفع'
        when 'shipped' then 'تم شحن الطلب بعد اعتماد الدفع'
        when 'delivered' then 'تم تسليم الطلب بعد اعتماد الدفع'
        when 'cancelled' then 'تم إلغاء الطلب'
        else 'تم تحديث حالة الطلب'
      end,
      auth.uid()
    );
  end if;
  return new;
end
$function$;
CREATE OR REPLACE FUNCTION public.apex_admin_verify_order_payment(p_order_id bigint, p_admin_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.apex_orders%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1 from public.apex_admins a where a.user_id = auth.uid()
  ) then
    raise exception 'غير مصرح: هذه العملية للمدير فقط';
  end if;

  select * into v_order
  from public.apex_orders
  where id = p_order_id
  for update;

  if not found then raise exception 'الطلب غير موجود'; end if;
  if lower(coalesce(v_order.payment_status,'pending')) in ('paid','succeeded','completed','verified') then
    raise exception 'تم اعتماد دفع هذا الطلب مسبقاً';
  end if;
  if not exists (
    select 1 from public.apex_payment_methods m
    where m.name = v_order.payment_method and m.method_type = 'manual' and m.enabled = true
  ) then
    raise exception 'لا يمكن اعتماد هذه الوسيلة يدوياً أو أنها غير مفعلة';
  end if;

  perform set_config('apex.payment_verification_context','manual_admin_verified',true);
  update public.apex_orders
  set payment_status = 'paid',
      notes = left(coalesce(notes,'') || E'\nمراجعة الدفع من الإدارة: ' || left(coalesce(nullif(trim(p_admin_note),''),'تم التحقق من الحوالة خارجياً'),300), 1500),
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('success',true,'order_id',p_order_id,'payment_status','paid');
end
$function$;
CREATE OR REPLACE FUNCTION public.apex_admin_refund_order_to_wallet(p_order_id bigint, p_reason text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  raise exception 'تم إيقاف الاسترداد المباشر. استخدم نظام طلب إرجاع المنتج وتأكيد استلامه لتحرير المبلغ المقيد.';
end;
$function$;

DROP TRIGGER IF EXISTS apex_order_status_guard_history ON public.apex_orders;
CREATE TRIGGER apex_order_status_guard_history BEFORE INSERT OR UPDATE ON public.apex_orders
FOR EACH ROW EXECUTE FUNCTION private.apex_guard_order_status_and_history();
REVOKE ALL ON FUNCTION public.apex_admin_verify_order_payment(bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apex_admin_verify_order_payment(bigint,text) TO authenticated;
REVOKE ALL ON FUNCTION public.apex_admin_refund_order_to_wallet(bigint,text) FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS apex_order_refunds_order_id_idx ON public.apex_order_refunds(order_id);
DROP POLICY IF EXISTS "customers submit own or guest orders" ON public.apex_orders;
REVOKE INSERT ON public.apex_orders FROM anon,authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.apex_email_settings,public.apex_order_status_history,public.apex_referral_codes,public.apex_referral_rewards,public.apex_referral_signups,public.apex_referral_visits,public.apex_shipping_providers,public.apex_wallet_topups,public.apex_wallet_transactions,public.apex_wallets FROM anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.apex_referral_rewards FROM authenticated;
GRANT SELECT ON TABLE public.apex_referral_rewards TO authenticated;
