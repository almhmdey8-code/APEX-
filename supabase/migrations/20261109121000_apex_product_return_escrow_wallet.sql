-- Product-level returns with wallet escrow.
-- The customer can request a return only for a delivered, paid order.
-- The refund remains in restricted_balance_sar until an admin confirms receipt.

alter table public.apex_wallets
  add column if not exists restricted_balance_sar numeric(14,2) not null default 0;
alter table public.apex_wallets
  add constraint apex_wallets_restricted_balance_sar_check check (restricted_balance_sar >= 0);

alter table public.apex_order_refunds alter column admin_id drop not null;
alter table public.apex_order_refunds
  add column if not exists product_id bigint,
  add column if not exists product_name text not null default '',
  add column if not exists quantity integer not null default 1,
  add column if not exists status text not null default 'released',
  add column if not exists customer_reason text not null default '',
  add column if not exists admin_note text not null default '',
  add column if not exists received_at timestamptz,
  add column if not exists released_at timestamptz;
alter table public.apex_order_refunds drop constraint if exists apex_order_refunds_order_id_key;
alter table public.apex_order_refunds
  add constraint apex_order_refunds_quantity_check check (quantity > 0),
  add constraint apex_order_refunds_status_check check (status in ('returning','released','rejected'));
create index if not exists apex_order_refunds_user_created_idx on public.apex_order_refunds(user_id,created_at desc);
create index if not exists apex_order_refunds_status_created_idx on public.apex_order_refunds(status,created_at desc);

alter table public.apex_wallet_transactions drop constraint if exists apex_wallet_transactions_transaction_type_check;
alter table public.apex_wallet_transactions add constraint apex_wallet_transactions_transaction_type_check
  check (transaction_type = any (array['top_up','referral_reward','purchase','refund','refund_pending','refund_release','refund_rejected','admin_adjustment']));

drop policy if exists "Customers read own order refunds" on public.apex_order_refunds;
create policy "Customers read own order refunds" on public.apex_order_refunds
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.apex_order_refunds to authenticated;

create or replace function public.apex_request_product_return(p_order_id bigint,p_product_id bigint,p_quantity integer,p_reason text default '')
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid(); v_order public.apex_orders%rowtype; v_item jsonb;
  v_order_qty integer; v_already_requested integer; v_unit_price numeric(14,2);
  v_amount numeric(14,2); v_name text; v_return_id bigint;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  if p_order_id is null or p_product_id is null or p_quantity is null or p_quantity < 1 or p_quantity > 20 then raise exception 'بيانات طلب الإرجاع غير صحيحة'; end if;
  select * into v_order from public.apex_orders where id=p_order_id and user_id=v_uid for update;
  if not found then raise exception 'الطلب غير موجود في حسابك'; end if;
  if v_order.status <> 'delivered' then raise exception 'يمكن طلب إرجاع المنتج بعد تأكيد استلام الطلب فقط'; end if;
  if v_order.payment_status <> 'paid' then raise exception 'لا يمكن إرجاع منتج من طلب غير مدفوع'; end if;
  if jsonb_typeof(v_order.items) is distinct from 'array' then raise exception 'تفاصيل منتجات الطلب غير متاحة للإرجاع'; end if;
  select x,greatest(1,coalesce((x->>'quantity')::integer,1)),
    coalesce(nullif(x->>'unit_price_sar','')::numeric,nullif(x->>'price','')::numeric,
      case when greatest(1,coalesce((x->>'quantity')::integer,1))>0 then nullif(x->>'line_total_sar','')::numeric/greatest(1,coalesce((x->>'quantity')::integer,1)) else null end),
    coalesce(x->>'name','منتج #'||p_product_id::text)
  into v_item,v_order_qty,v_unit_price,v_name
  from jsonb_array_elements(v_order.items) x where (x->>'id')::bigint=p_product_id limit 1;
  if v_item is null then raise exception 'المنتج غير موجود ضمن هذا الطلب'; end if;
  if v_unit_price is null or v_unit_price<=0 then raise exception 'تعذر تحديد سعر المنتج وقت الشراء؛ تواصل مع خدمة العملاء'; end if;
  select coalesce(sum(r.quantity),0)::integer into v_already_requested from public.apex_order_refunds r
    where r.order_id=p_order_id and r.product_id=p_product_id and r.status in ('returning','released');
  if v_already_requested+p_quantity>v_order_qty then raise exception 'كمية الإرجاع تتجاوز الكمية التي اشتريتها والمتبقية للإرجاع'; end if;
  v_amount:=round(v_unit_price*p_quantity,2);
  insert into public.apex_wallets(user_id,balance_sar,restricted_balance_sar) values(v_uid,0,0) on conflict(user_id) do nothing;
  insert into public.apex_order_refunds(order_id,user_id,amount_sar,admin_id,reason,product_id,product_name,quantity,status,customer_reason,admin_note)
    values(p_order_id,v_uid,v_amount,null,left(coalesce(p_reason,''),500),p_product_id,left(v_name,200),p_quantity,'returning',left(coalesce(p_reason,''),500),'') returning id into v_return_id;
  update public.apex_wallets set restricted_balance_sar=restricted_balance_sar+v_amount,updated_at=now() where user_id=v_uid;
  insert into public.apex_wallet_transactions(user_id,amount_sar,transaction_type,description,reference_type,reference_id)
    values(v_uid,v_amount,'refund_pending','مبلغ إرجاع مقيد للمنتج '||left(v_name,120)||' — طلب #'||p_order_id,'order_return',v_return_id::text);
  insert into public.apex_order_status_history(order_id,status,note,changed_by)
    values(p_order_id,'return_requested','طلب العميل إرجاع '||left(v_name,120)||' — المبلغ '||v_amount::text||' ر.س مقيد حتى استلام المنتج',v_uid);
  return jsonb_build_object('ok',true,'return_id',v_return_id,'status','returning','amount_sar',v_amount,'restricted',true);
end;
$function$;

create or replace function public.apex_admin_receive_product_return(p_return_id bigint,p_admin_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_admin uuid:=auth.uid(); v_return public.apex_order_refunds%rowtype;
begin
  if v_admin is null or not exists(select 1 from public.apex_admins a where a.user_id=v_admin) then raise exception 'غير مصرح: هذه العملية للمدير فقط'; end if;
  select * into v_return from public.apex_order_refunds where id=p_return_id for update;
  if not found then raise exception 'طلب الإرجاع غير موجود'; end if;
  if v_return.status<>'returning' then raise exception 'طلب الإرجاع تمت معالجته مسبقاً أو ليس في حالة انتظار الاستلام'; end if;
  perform 1 from public.apex_wallets where user_id=v_return.user_id for update;
  if not found then raise exception 'محفظة العميل غير موجودة'; end if;
  update public.apex_wallets set restricted_balance_sar=restricted_balance_sar-v_return.amount_sar,balance_sar=balance_sar+v_return.amount_sar,updated_at=now()
    where user_id=v_return.user_id and restricted_balance_sar>=v_return.amount_sar;
  if not found then raise exception 'الرصيد المقيد لا يطابق طلب الإرجاع؛ أوقفنا التحرير للحماية'; end if;
  update public.apex_order_refunds set status='released',admin_id=v_admin,admin_note=left(coalesce(p_admin_note,''),500),received_at=now(),released_at=now() where id=p_return_id;
  insert into public.apex_wallet_transactions(user_id,amount_sar,transaction_type,description,reference_type,reference_id)
    values(v_return.user_id,v_return.amount_sar,'refund_release','تم استلام المنتج وتحرير مبلغ الإرجاع إلى المحفظة — طلب #'||v_return.order_id,'order_return',v_return.id::text);
  insert into public.apex_order_status_history(order_id,status,note,changed_by)
    values(v_return.order_id,'return_released','تم استلام المنتج وتحرير '||v_return.amount_sar::text||' ر.س إلى محفظة العميل',v_admin);
  return jsonb_build_object('ok',true,'return_id',p_return_id,'status','released','amount_sar',v_return.amount_sar);
end;
$function$;

create or replace function public.apex_admin_reject_product_return(p_return_id bigint,p_admin_note text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_admin uuid:=auth.uid(); v_return public.apex_order_refunds%rowtype;
begin
  if v_admin is null or not exists(select 1 from public.apex_admins a where a.user_id=v_admin) then raise exception 'غير مصرح: هذه العملية للمدير فقط'; end if;
  if coalesce(trim(p_admin_note),'')='' then raise exception 'اكتب سبب رفض طلب الإرجاع'; end if;
  select * into v_return from public.apex_order_refunds where id=p_return_id for update;
  if not found then raise exception 'طلب الإرجاع غير موجود'; end if;
  if v_return.status<>'returning' then raise exception 'لا يمكن رفض طلب تمت معالجته مسبقاً'; end if;
  perform 1 from public.apex_wallets where user_id=v_return.user_id for update;
  update public.apex_wallets set restricted_balance_sar=restricted_balance_sar-v_return.amount_sar,updated_at=now()
    where user_id=v_return.user_id and restricted_balance_sar>=v_return.amount_sar;
  if not found then raise exception 'تعذر تحرير الرصيد المقيد؛ راجع المحفظة'; end if;
  update public.apex_order_refunds set status='rejected',admin_id=v_admin,admin_note=left(trim(p_admin_note),500) where id=p_return_id;
  insert into public.apex_wallet_transactions(user_id,amount_sar,transaction_type,description,reference_type,reference_id)
    values(v_return.user_id,v_return.amount_sar,'refund_rejected','تم رفض طلب إرجاع المنتج للطلب #'||v_return.order_id||' — '||left(trim(p_admin_note),250),'order_return',v_return.id::text);
  insert into public.apex_order_status_history(order_id,status,note,changed_by)
    values(v_return.order_id,'return_rejected','تم رفض طلب الإرجاع: '||left(trim(p_admin_note),400),v_admin);
  return jsonb_build_object('ok',true,'return_id',p_return_id,'status','rejected');
end;
$function$;

-- Disable the old immediate full-order refund path to prevent bypassing receipt verification.
create or replace function public.apex_admin_refund_order_to_wallet(p_order_id bigint,p_reason text default '')
returns jsonb language plpgsql security definer set search_path = '' as $function$
begin
  raise exception 'تم إيقاف الاسترداد المباشر. استخدم نظام طلب إرجاع المنتج وتأكيد استلامه لتحرير المبلغ المقيد.';
end;
$function$;

revoke all on function public.apex_request_product_return(bigint,bigint,integer,text) from public,anon;
revoke all on function public.apex_admin_receive_product_return(bigint,text) from public,anon;
revoke all on function public.apex_admin_reject_product_return(bigint,text) from public,anon;
revoke all on function public.apex_admin_refund_order_to_wallet(bigint,text) from public,anon;
grant execute on function public.apex_request_product_return(bigint,bigint,integer,text) to authenticated;
grant execute on function public.apex_admin_receive_product_return(bigint,text) to authenticated;
grant execute on function public.apex_admin_reject_product_return(bigint,text) to authenticated;
grant execute on function public.apex_admin_refund_order_to_wallet(bigint,text) to authenticated;
