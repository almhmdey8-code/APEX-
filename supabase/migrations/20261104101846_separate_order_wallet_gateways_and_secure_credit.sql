
alter table public.apex_payment_methods
  add column if not exists orders_enabled boolean not null default true;

alter table public.apex_wallet_topups
  add column if not exists payment_method_type text not null default 'manual',
  add column if not exists gateway_provider text,
  add column if not exists provider_payment_id text,
  add column if not exists paid_at timestamptz;

create unique index if not exists apex_wallet_topups_provider_payment_once
  on public.apex_wallet_topups(gateway_provider, provider_payment_id)
  where gateway_provider is not null and provider_payment_id is not null;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create or replace function private.apex_credit_verified_gateway_topup(
  p_topup_id bigint,
  p_gateway_provider text,
  p_provider_payment_id text,
  p_amount_sar numeric,
  p_currency text default 'SAR'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topup public.apex_wallet_topups%rowtype;
begin
  if p_gateway_provider is null or length(trim(p_gateway_provider)) = 0
     or p_provider_payment_id is null or length(trim(p_provider_payment_id)) = 0 then
    raise exception 'بيانات عملية الدفع غير مكتملة';
  end if;
  if upper(coalesce(p_currency,'')) <> 'SAR' then
    raise exception 'عملة الدفع غير مدعومة';
  end if;
  if p_amount_sar is null or p_amount_sar <= 0 then
    raise exception 'مبلغ الدفع غير صحيح';
  end if;

  select * into v_topup
  from public.apex_wallet_topups
  where id = p_topup_id
  for update;

  if not found then
    raise exception 'طلب شحن المحفظة غير موجود';
  end if;

  if v_topup.status = 'approved'
     and v_topup.gateway_provider = p_gateway_provider
     and v_topup.provider_payment_id = p_provider_payment_id then
    return jsonb_build_object('success', true, 'already_processed', true);
  end if;

  if v_topup.status <> 'pending' then
    raise exception 'طلب الشحن ليس قيد الانتظار';
  end if;
  if v_topup.payment_method_type <> 'gateway'
     or v_topup.gateway_provider <> p_gateway_provider then
    raise exception 'مزود الدفع لا يطابق وسيلة الشحن المسجلة';
  end if;
  if round(v_topup.amount_sar,2) <> round(p_amount_sar,2) then
    raise exception 'المبلغ المحصل لا يطابق مبلغ طلب الشحن';
  end if;

  insert into public.apex_wallets(user_id, balance_sar)
  values (v_topup.user_id, 0)
  on conflict (user_id) do nothing;

  insert into public.apex_wallet_transactions(
    user_id, amount_sar, transaction_type, description, reference_type, reference_id
  ) values (
    v_topup.user_id, v_topup.amount_sar, 'top_up',
    'شحن المحفظة إلكترونياً عبر ' || v_topup.payment_method_name,
    'wallet_topup', v_topup.id::text
  );

  update public.apex_wallets
  set balance_sar = balance_sar + v_topup.amount_sar, updated_at = now()
  where user_id = v_topup.user_id;

  update public.apex_wallet_topups
  set status = 'approved',
      gateway_provider = p_gateway_provider,
      provider_payment_id = p_provider_payment_id,
      paid_at = now(),
      reviewed_at = now(),
      updated_at = now(),
      admin_note = 'تم التحقق من الدفع إلكترونياً'
  where id = p_topup_id;

  return jsonb_build_object('success', true, 'already_processed', false);
end;
$$;

revoke all on function private.apex_credit_verified_gateway_topup(bigint,text,text,numeric,text) from public, anon, authenticated;
grant execute on function private.apex_credit_verified_gateway_topup(bigint,text,text,numeric,text) to service_role;

create or replace function public.apex_admin_review_wallet_topup(
  p_topup_id bigint,
  p_decision text,
  p_admin_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := auth.uid();
  v_topup public.apex_wallet_topups%rowtype;
begin
  if v_admin is null or not exists (
    select 1 from public.apex_admins a where a.user_id = v_admin
  ) then
    raise exception 'غير مصرح: هذه العملية للمدير فقط';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'قرار المراجعة غير صحيح';
  end if;

  select * into v_topup
  from public.apex_wallet_topups
  where id = p_topup_id
  for update;

  if not found then
    raise exception 'طلب الشحن غير موجود';
  end if;
  if v_topup.payment_method_type = 'gateway' then
    raise exception 'الشحن الإلكتروني لا يعتمد يدوياً؛ يجب التحقق من إشعار بوابة الدفع';
  end if;
  if v_topup.status <> 'pending' then
    raise exception 'تمت مراجعة طلب الشحن مسبقاً';
  end if;

  if p_decision = 'approved' then
    insert into public.apex_wallets(user_id, balance_sar)
    values (v_topup.user_id, 0)
    on conflict (user_id) do nothing;

    insert into public.apex_wallet_transactions(
      user_id, amount_sar, transaction_type, description, reference_type, reference_id
    ) values (
      v_topup.user_id, v_topup.amount_sar, 'top_up',
      'شحن المحفظة عبر ' || v_topup.payment_method_name,
      'wallet_topup', v_topup.id::text
    );

    update public.apex_wallets
    set balance_sar = balance_sar + v_topup.amount_sar, updated_at = now()
    where user_id = v_topup.user_id;
  end if;

  update public.apex_wallet_topups
  set status = p_decision,
      admin_note = nullif(left(trim(coalesce(p_admin_note, '')), 500), ''),
      reviewed_by = v_admin,
      reviewed_at = now(),
      updated_at = now()
  where id = p_topup_id;

  return jsonb_build_object('success', true, 'status', p_decision);
end;
$function$;
