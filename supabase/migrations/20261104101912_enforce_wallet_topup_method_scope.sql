
create or replace function public.apex_request_wallet_topup(
  p_amount_sar numeric,
  p_payment_method_id bigint,
  p_customer_reference text default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_method record;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;
  if p_amount_sar is null or p_amount_sar <= 0 or p_amount_sar <> round(p_amount_sar, 2) then
    raise exception 'أدخل مبلغاً صحيحاً بالريال السعودي';
  end if;

  select id, name, instructions, method_type, enabled, wallet_topup_enabled, gateway_provider
  into v_method
  from public.apex_payment_methods
  where id = p_payment_method_id and enabled = true and wallet_topup_enabled = true;

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
