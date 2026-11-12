-- Fail closed: no manual approval may mark an order or wallet top-up as paid.
-- Only a verified payment-provider webhook may use the gateway_verified context.
CREATE OR REPLACE FUNCTION public.apex_admin_verify_order_payment(
  p_order_id bigint,
  p_admin_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.apex_admin_require_trusted_device();
  RAISE EXCEPTION 'اعتماد الدفع اليدوي متوقف. لا يُعتمد الطلب إلا بعد تأكيد مباشر موثّق من مزود الدفع.';
END;
$$;

CREATE OR REPLACE FUNCTION public.apex_admin_review_wallet_topup(
  p_topup_id bigint,
  p_decision text,
  p_admin_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin uuid;
  v_topup public.apex_wallet_topups%rowtype;
BEGIN
  v_admin := public.apex_admin_require_trusted_device();
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'قرار المراجعة غير صحيح';
  END IF;
  IF p_decision = 'approved' THEN
    RAISE EXCEPTION 'اعتماد شحن المحفظة اليدوي متوقف. يلزم تأكيد مباشر من مزود الدفع.';
  END IF;
  SELECT * INTO v_topup
  FROM public.apex_wallet_topups
  WHERE id = p_topup_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'طلب الشحن غير موجود'; END IF;
  IF v_topup.status <> 'pending' THEN RAISE EXCEPTION 'تمت مراجعة طلب الشحن مسبقاً'; END IF;
  UPDATE public.apex_wallet_topups
  SET status = 'rejected',
      admin_note = nullif(left(trim(coalesce(p_admin_note,'')),500),''),
      reviewed_by = v_admin,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_topup_id;
  RETURN jsonb_build_object('success',true,'status','rejected');
END;
$$;

-- Protect direct image uploads as well as the Product Studio's UI checks.
DROP POLICY IF EXISTS "Admins upload APEX store images" ON storage.objects;
CREATE POLICY "Admins upload APEX store images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'apex-store'
  AND (SELECT auth.jwt() ->> 'aal') = 'aal2'
  AND EXISTS (SELECT 1 FROM public.apex_admins a WHERE a.user_id = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Admins update APEX store images" ON storage.objects;
CREATE POLICY "Admins update APEX store images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'apex-store'
  AND (SELECT auth.jwt() ->> 'aal') = 'aal2'
  AND EXISTS (SELECT 1 FROM public.apex_admins a WHERE a.user_id = (SELECT auth.uid()))
)
WITH CHECK (
  bucket_id = 'apex-store'
  AND (SELECT auth.jwt() ->> 'aal') = 'aal2'
  AND EXISTS (SELECT 1 FROM public.apex_admins a WHERE a.user_id = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Admins delete APEX store images" ON storage.objects;
CREATE POLICY "Admins delete APEX store images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'apex-store'
  AND (SELECT auth.jwt() ->> 'aal') = 'aal2'
  AND EXISTS (SELECT 1 FROM public.apex_admins a WHERE a.user_id = (SELECT auth.uid()))
);
