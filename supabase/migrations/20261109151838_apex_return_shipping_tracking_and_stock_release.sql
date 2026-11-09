alter table public.apex_order_refunds
  add column if not exists return_carrier text,
  add column if not exists return_tracking_number text,
  add column if not exists return_shipping_status text not null default 'return_requested',
  add column if not exists stock_restored_at timestamptz;

update public.apex_order_refunds
set return_shipping_status = case
  when status='released' then 'stocked'
  when status='rejected' then 'rejected'
  else coalesce(nullif(return_shipping_status,''),'return_requested')
end
where return_shipping_status is null or return_shipping_status='return_requested';

create or replace function public.apex_admin_update_product_return_shipping(
  p_return_id bigint,
  p_carrier text default null,
  p_tracking_number text default null,
  p_shipping_status text default 'in_transit'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_admin uuid := auth.uid();
  v_return public.apex_order_refunds%rowtype;
begin
  if v_admin is null or not exists(select 1 from public.apex_admins a where a.user_id=v_admin) then
    raise exception 'غير مصرح: هذه العملية للمدير فقط';
  end if;
  if p_shipping_status not in ('return_requested','in_transit') then
    raise exception 'حالة شحن الإرجاع غير صحيحة';
  end if;
  select * into v_return from public.apex_order_refunds where id=p_return_id for update;
  if not found then raise exception 'طلب الإرجاع غير موجود'; end if;
  if v_return.status <> 'returning' then raise exception 'لا يمكن تحديث تتبع إرجاع تمت معالجته'; end if;
  update public.apex_order_refunds
  set return_carrier=left(nullif(trim(coalesce(p_carrier,'')),''),120),
      return_tracking_number=left(nullif(trim(coalesce(p_tracking_number,'')),''),160),
      return_shipping_status=p_shipping_status
  where id=p_return_id;
  insert into public.apex_order_status_history(order_id,status,note,changed_by)
  values(v_return.order_id,'return_requested',
    'تحديث شحنة الإرجاع: '||
    case when p_shipping_status='in_transit' then 'المنتج في طريق العودة' else 'بانتظار تسليم المنتج لشركة الشحن' end||
    case when nullif(trim(coalesce(p_carrier,'')),'') is not null then ' · الشركة: '||left(trim(p_carrier),120) else '' end||
    case when nullif(trim(coalesce(p_tracking_number,'')),'') is not null then ' · رقم التتبع: '||left(trim(p_tracking_number),160) else '' end,
    v_admin);
  return jsonb_build_object('ok',true,'return_id',p_return_id,'shipping_status',p_shipping_status);
end;
$function$;

revoke all on function public.apex_admin_update_product_return_shipping(bigint,text,text,text) from public, anon;
grant execute on function public.apex_admin_update_product_return_shipping(bigint,text,text,text) to authenticated;

create or replace function public.apex_admin_receive_product_return(p_return_id bigint, p_admin_note text default '')
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_admin uuid := auth.uid();
  v_return public.apex_order_refunds%rowtype;
  v_product_name text;
begin
  if v_admin is null or not exists (
    select 1 from public.apex_admins a where a.user_id=v_admin
  ) then raise exception 'غير مصرح: هذه العملية للمدير فقط'; end if;

  select * into v_return
  from public.apex_order_refunds
  where id=p_return_id
  for update;
  if not found then raise exception 'طلب الإرجاع غير موجود'; end if;
  if v_return.status <> 'returning' then
    raise exception 'طلب الإرجاع تمت معالجته مسبقاً أو ليس في حالة انتظار الاستلام';
  end if;
  if v_return.product_id is null then
    raise exception 'لا يمكن إعادة المخزون: المنتج غير محدد في طلب الإرجاع';
  end if;

  select p.name into v_product_name
  from public.apex_products p
  where p.id=v_return.product_id
  for update;
  if not found then raise exception 'المنتج غير موجود في المخزون؛ لم يتم تحرير المبلغ'; end if;

  perform 1 from public.apex_wallets
  where user_id=v_return.user_id for update;
  if not found then raise exception 'محفظة العميل غير موجودة'; end if;

  update public.apex_products
  set stock=stock+v_return.quantity,updated_at=now()
  where id=v_return.product_id;

  update public.apex_wallets
  set restricted_balance_sar=restricted_balance_sar-v_return.amount_sar,
      balance_sar=balance_sar+v_return.amount_sar,
      updated_at=now()
  where user_id=v_return.user_id
    and restricted_balance_sar >= v_return.amount_sar;
  if not found then raise exception 'الرصيد المقيد لا يطابق طلب الإرجاع؛ أوقفنا العملية للحماية'; end if;

  update public.apex_order_refunds
  set status='released',admin_id=v_admin,
      admin_note=left(coalesce(p_admin_note,''),500),
      received_at=now(),released_at=now(),
      return_shipping_status='stocked',stock_restored_at=now()
  where id=p_return_id;

  insert into public.apex_wallet_transactions(
    user_id,amount_sar,transaction_type,description,reference_type,reference_id
  ) values (
    v_return.user_id,v_return.amount_sar,'refund_release',
    'تم استلام المنتج وإعادته للمخزون وتحرير مبلغ الإرجاع إلى المحفظة — طلب #'||v_return.order_id,
    'order_return',v_return.id::text
  );

  insert into public.apex_order_status_history(order_id,status,note,changed_by)
  values(v_return.order_id,'return_released',
    'تم استلام المنتج '||left(v_return.product_name,120)||' وإعادته للمخزون (+'||v_return.quantity::text||') وتحرير '||v_return.amount_sar::text||' ر.س إلى محفظة العميل',
    v_admin);

  return jsonb_build_object('ok',true,'return_id',p_return_id,
    'status','released','amount_sar',v_return.amount_sar,
    'stock_restored',true,'quantity',v_return.quantity);
end;
$function$;

revoke all on function public.apex_admin_receive_product_return(bigint,text) from public, anon;
grant execute on function public.apex_admin_receive_product_return(bigint,text) to authenticated;
