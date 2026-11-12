-- Enforce AAL2 and a server-validated trusted-device header for sensitive admin operations.
-- Applied to Supabase project ulzxdvtzziydhuvennzw as migration 20261112102557.

CREATE OR REPLACE FUNCTION public.apex_admin_require_trusted_device()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_device_id uuid;
  v_headers jsonb;
BEGIN
  v_uid := public.apex_admin_require_aal2();
  BEGIN
    v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
    v_device_id := nullif(v_headers ->> 'x-apex-device-id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'admin_trusted_device_required' USING ERRCODE='42501';
  END;
  IF v_device_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.apex_admin_trusted_devices d
    WHERE d.user_id=v_uid AND d.device_id=v_device_id
  ) THEN
    RAISE EXCEPTION 'admin_trusted_device_required' USING ERRCODE='42501';
  END IF;
  UPDATE public.apex_admin_trusted_devices SET last_seen_at=now()
  WHERE user_id=v_uid AND device_id=v_device_id;
  RETURN v_uid;
END;
$$;
REVOKE ALL ON FUNCTION public.apex_admin_require_trusted_device() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apex_admin_require_trusted_device() TO postgres,service_role;

CREATE OR REPLACE FUNCTION public.apex_admin_receive_product_return(p_return_id bigint,p_admin_note text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_admin uuid; v_return public.apex_order_refunds%rowtype; v_product_name text;
BEGIN
  v_admin:=public.apex_admin_require_trusted_device();
  SELECT * INTO v_return FROM public.apex_order_refunds WHERE id=p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'طلب الإرجاع غير موجود'; END IF;
  IF v_return.status<>'returning' THEN RAISE EXCEPTION 'طلب الإرجاع تمت معالجته مسبقاً أو ليس في حالة انتظار الاستلام'; END IF;
  IF v_return.product_id IS NULL THEN RAISE EXCEPTION 'لا يمكن إعادة المخزون: المنتج غير محدد في طلب الإرجاع'; END IF;
  SELECT p.name INTO v_product_name FROM public.apex_products p WHERE p.id=v_return.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'المنتج غير موجود في المخزون؛ لم يتم تحرير المبلغ'; END IF;
  PERFORM 1 FROM public.apex_wallets WHERE user_id=v_return.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'محفظة العميل غير موجودة'; END IF;
  UPDATE public.apex_products SET stock=stock+v_return.quantity,updated_at=now() WHERE id=v_return.product_id;
  UPDATE public.apex_wallets SET restricted_balance_sar=restricted_balance_sar-v_return.amount_sar,
    balance_sar=balance_sar+v_return.amount_sar,updated_at=now()
    WHERE user_id=v_return.user_id AND restricted_balance_sar>=v_return.amount_sar;
  IF NOT FOUND THEN RAISE EXCEPTION 'الرصيد المقيد لا يطابق طلب الإرجاع؛ أوقفنا العملية للحماية'; END IF;
  UPDATE public.apex_order_refunds SET status='released',admin_id=v_admin,
    admin_note=left(coalesce(p_admin_note,''),500),received_at=now(),released_at=now(),
    return_shipping_status='stocked',stock_restored_at=now() WHERE id=p_return_id;
  INSERT INTO public.apex_wallet_transactions(user_id,amount_sar,transaction_type,description,reference_type,reference_id)
  VALUES(v_return.user_id,v_return.amount_sar,'refund_release',
    'تم استلام المنتج وإعادته للمخزون وتحرير مبلغ الإرجاع إلى المحفظة — طلب #'||v_return.order_id,
    'order_return',v_return.id::text);
  INSERT INTO public.apex_order_status_history(order_id,status,note,changed_by)
  VALUES(v_return.order_id,'return_released',
    'تم استلام المنتج '||left(v_return.product_name,120)||' وإعادته للمخزون (+'||v_return.quantity::text||') وتحرير '||v_return.amount_sar::text||' ر.س إلى محفظة العميل',v_admin);
  RETURN jsonb_build_object('ok',true,'return_id',p_return_id,'status','released',
    'amount_sar',v_return.amount_sar,'stock_restored',true,'quantity',v_return.quantity);
END;
$$;

CREATE OR REPLACE FUNCTION public.apex_admin_reject_product_return(p_return_id bigint,p_admin_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_admin uuid; v_return public.apex_order_refunds%rowtype;
BEGIN
  v_admin:=public.apex_admin_require_trusted_device();
  IF coalesce(trim(p_admin_note),'')='' THEN RAISE EXCEPTION 'اكتب سبب رفض طلب الإرجاع'; END IF;
  SELECT * INTO v_return FROM public.apex_order_refunds WHERE id=p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'طلب الإرجاع غير موجود'; END IF;
  IF v_return.status<>'returning' THEN RAISE EXCEPTION 'لا يمكن رفض طلب تمت معالجته مسبقاً'; END IF;
  PERFORM 1 FROM public.apex_wallets WHERE user_id=v_return.user_id FOR UPDATE;
  UPDATE public.apex_wallets SET restricted_balance_sar=restricted_balance_sar-v_return.amount_sar,updated_at=now()
    WHERE user_id=v_return.user_id AND restricted_balance_sar>=v_return.amount_sar;
  IF NOT FOUND THEN RAISE EXCEPTION 'تعذر تحرير الرصيد المقيد؛ راجع المحفظة'; END IF;
  UPDATE public.apex_order_refunds SET status='rejected',admin_id=v_admin,admin_note=left(trim(p_admin_note),500) WHERE id=p_return_id;
  INSERT INTO public.apex_wallet_transactions(user_id,amount_sar,transaction_type,description,reference_type,reference_id)
  VALUES(v_return.user_id,v_return.amount_sar,'refund_rejected',
    'تم رفض طلب إرجاع المنتج للطلب #'||v_return.order_id||' — '||left(trim(p_admin_note),250),
    'order_return',v_return.id::text);
  INSERT INTO public.apex_order_status_history(order_id,status,note,changed_by)
  VALUES(v_return.order_id,'return_rejected','تم رفض طلب الإرجاع: '||left(trim(p_admin_note),400),v_admin);
  RETURN jsonb_build_object('ok',true,'return_id',p_return_id,'status','rejected');
END;
$$;

CREATE OR REPLACE FUNCTION public.apex_admin_review_wallet_topup(p_topup_id bigint,p_decision text,p_admin_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_admin uuid; v_topup public.apex_wallet_topups%rowtype;
BEGIN
  v_admin:=public.apex_admin_require_trusted_device();
  IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'قرار المراجعة غير صحيح'; END IF;
  SELECT * INTO v_topup FROM public.apex_wallet_topups WHERE id=p_topup_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'طلب الشحن غير موجود'; END IF;
  IF v_topup.payment_method_type='gateway' THEN RAISE EXCEPTION 'الشحن الإلكتروني لا يعتمد يدوياً؛ يجب التحقق من إشعار بوابة الدفع'; END IF;
  IF v_topup.status<>'pending' THEN RAISE EXCEPTION 'تمت مراجعة طلب الشحن مسبقاً'; END IF;
  IF p_decision='approved' THEN
    INSERT INTO public.apex_wallets(user_id,balance_sar) VALUES(v_topup.user_id,0) ON CONFLICT(user_id) DO NOTHING;
    INSERT INTO public.apex_wallet_transactions(user_id,amount_sar,transaction_type,description,reference_type,reference_id)
    VALUES(v_topup.user_id,v_topup.amount_sar,'top_up','شحن المحفظة عبر '||v_topup.payment_method_name,'wallet_topup',v_topup.id::text);
    UPDATE public.apex_wallets SET balance_sar=balance_sar+v_topup.amount_sar,updated_at=now() WHERE user_id=v_topup.user_id;
  END IF;
  UPDATE public.apex_wallet_topups SET status=p_decision,
    admin_note=nullif(left(trim(coalesce(p_admin_note,'')),500),''),
    reviewed_by=v_admin,reviewed_at=now(),updated_at=now() WHERE id=p_topup_id;
  RETURN jsonb_build_object('success',true,'status',p_decision);
END;
$$;

CREATE OR REPLACE FUNCTION public.apex_admin_update_product_return_shipping(
  p_return_id bigint,p_carrier text DEFAULT NULL,p_tracking_number text DEFAULT NULL,p_shipping_status text DEFAULT 'in_transit'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_admin uuid; v_return public.apex_order_refunds%rowtype;
BEGIN
  v_admin:=public.apex_admin_require_trusted_device();
  IF p_shipping_status NOT IN ('return_requested','in_transit') THEN RAISE EXCEPTION 'حالة شحن الإرجاع غير صحيحة'; END IF;
  SELECT * INTO v_return FROM public.apex_order_refunds WHERE id=p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'طلب الإرجاع غير موجود'; END IF;
  IF v_return.status<>'returning' THEN RAISE EXCEPTION 'لا يمكن تحديث تتبع إرجاع تمت معالجته'; END IF;
  UPDATE public.apex_order_refunds SET return_carrier=left(nullif(trim(coalesce(p_carrier,'')),''),120),
    return_tracking_number=left(nullif(trim(coalesce(p_tracking_number,'')),''),160),return_shipping_status=p_shipping_status
    WHERE id=p_return_id;
  INSERT INTO public.apex_order_status_history(order_id,status,note,changed_by)
  VALUES(v_return.order_id,'return_requested','تحديث شحنة الإرجاع: '||
    CASE WHEN p_shipping_status='in_transit' THEN 'المنتج في طريق العودة' ELSE 'بانتظار تسليم المنتج لشركة الشحن' END||
    CASE WHEN nullif(trim(coalesce(p_carrier,'')),'') IS NOT NULL THEN ' · الشركة: '||left(trim(p_carrier),120) ELSE '' END||
    CASE WHEN nullif(trim(coalesce(p_tracking_number,'')),'') IS NOT NULL THEN ' · رقم التتبع: '||left(trim(p_tracking_number),160) ELSE '' END,v_admin);
  RETURN jsonb_build_object('ok',true,'return_id',p_return_id,'shipping_status',p_shipping_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.apex_admin_verify_order_payment(p_order_id bigint,p_admin_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_admin uuid; v_order public.apex_orders%rowtype;
BEGIN
  v_admin:=public.apex_admin_require_trusted_device();
  SELECT * INTO v_order FROM public.apex_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF lower(coalesce(v_order.payment_status,'pending')) IN ('paid','succeeded','completed','verified') THEN RAISE EXCEPTION 'تم اعتماد دفع هذا الطلب مسبقاً'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.apex_payment_methods m WHERE m.name=v_order.payment_method AND m.method_type='manual' AND m.enabled=true) THEN
    RAISE EXCEPTION 'لا يمكن اعتماد هذه الوسيلة يدوياً أو أنها غير مفعلة';
  END IF;
  PERFORM set_config('apex.payment_verification_context','manual_admin_verified',true);
  UPDATE public.apex_orders SET payment_status='paid',
    notes=left(coalesce(notes,'')||E'\\nمراجعة الدفع من الإدارة: '||
      left(coalesce(nullif(trim(p_admin_note),''),'تم التحقق من الحوالة خارجياً'),300),1500),
    updated_at=now() WHERE id=p_order_id;
  RETURN jsonb_build_object('success',true,'order_id',p_order_id,'payment_status','paid');
END;
$$;

CREATE OR REPLACE FUNCTION public.apex_admin_register_device(p_device_id uuid,p_device_label text DEFAULT 'جهاز المدير')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_uid uuid;
BEGIN
  v_uid:=public.apex_admin_require_trusted_device();
  IF p_device_id IS DISTINCT FROM nullif(current_setting('request.headers',true)::jsonb->>'x-apex-device-id','')::uuid THEN
    RAISE EXCEPTION 'device_id_header_mismatch' USING ERRCODE='42501';
  END IF;
  UPDATE public.apex_admin_trusted_devices SET device_label=left(coalesce(nullif(trim(p_device_label),''),'جهاز المدير'),80),last_seen_at=now()
    WHERE user_id=v_uid AND device_id=p_device_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'admin_trusted_device_required' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('ok',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.apex_admin_create_device_invite(p_device_label text DEFAULT 'جهاز مدير جديد')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','auth','extensions'
AS $$
DECLARE v_uid uuid; v_token text;
BEGIN
  v_uid:=public.apex_admin_require_trusted_device();
  v_token:=encode(gen_random_bytes(32),'hex');
  INSERT INTO public.apex_admin_device_invites(user_id,token_hash,device_label,expires_at)
  VALUES(v_uid,encode(digest(convert_to(v_token,'UTF8'),'sha256'),'hex'),
    left(coalesce(nullif(trim(p_device_label),''),'جهاز مدير جديد'),80),now()+interval '10 minutes');
  RETURN jsonb_build_object('token',v_token,'expires_at',now()+interval '10 minutes');
END;
$$;

CREATE OR REPLACE FUNCTION public.apex_admin_list_trusted_devices()
RETURNS TABLE(id uuid,device_id uuid,device_label text,created_at timestamptz,last_seen_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','auth'
AS $$
DECLARE v_uid uuid;
BEGIN
  v_uid:=public.apex_admin_require_trusted_device();
  RETURN QUERY SELECT d.id,d.device_id,d.device_label,d.created_at,d.last_seen_at
    FROM public.apex_admin_trusted_devices d WHERE d.user_id=v_uid ORDER BY d.last_seen_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.apex_admin_revoke_trusted_device(p_device_row_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','auth'
AS $$
DECLARE v_uid uuid;
BEGIN
  v_uid:=public.apex_admin_require_trusted_device();
  DELETE FROM public.apex_admin_trusted_devices WHERE id=p_device_row_id AND user_id=v_uid;
  RETURN jsonb_build_object('ok',true);
END;
$$;

REVOKE ALL ON FUNCTION public.apex_admin_register_device(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apex_admin_register_device(uuid,text) TO authenticated,service_role;
GRANT USAGE ON SCHEMA public TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apex_track_referral_visit(text,text,text) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
