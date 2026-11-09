alter table public.apex_orders add column if not exists checkout_request_id uuid;
create unique index if not exists apex_orders_user_checkout_request_uidx on public.apex_orders(user_id,checkout_request_id) where checkout_request_id is not null;
create or replace function public.apex_wallet_checkout_backend(p_user_id uuid,p_customer_name text,p_phone text,p_address text,p_notes text,p_items jsonb,p_shipping_method text,p_request_id uuid)
returns bigint language plpgsql security invoker set search_path='' as $$
declare v_total numeric(14,2); v_order_id bigint; v_lines jsonb; v_count integer; v_requested integer;
begin
 if p_user_id is null or p_request_id is null then raise exception 'بيانات الشراء غير مكتملة'; end if;
 select id into v_order_id from public.apex_orders where user_id=p_user_id and checkout_request_id=p_request_id;
 if found then return v_order_id; end if;
 if coalesce(trim(p_customer_name),'')='' or coalesce(trim(p_phone),'')='' then raise exception 'الاسم ورقم الجوال مطلوبان'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>40 then raise exception 'السلة غير صالحة'; end if;
 select count(distinct (x->>'id')::bigint) into v_requested from jsonb_array_elements(p_items) x;
 with requested as (select (x->>'id')::bigint product_id,greatest(1,least(20,coalesce((x->>'quantity')::integer,1))) quantity from jsonb_array_elements(p_items) x),
 grouped as (select product_id,sum(quantity)::integer quantity from requested group by product_id)
 select count(*),coalesce(sum(p.price*g.quantity),0),jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'quantity',g.quantity,'unit_price_sar',p.price,'line_total_sar',p.price*g.quantity))
 into v_count,v_total,v_lines from grouped g join public.apex_products p on p.id=g.product_id where p.active=true and p.price>0;
 if v_count<>v_requested or v_total<=0 then raise exception 'منتج غير متاح أو لا يملك سعراً صالحاً'; end if;
 insert into public.apex_wallets(user_id,balance_sar) values(p_user_id,0) on conflict(user_id) do nothing;
 perform 1 from public.apex_wallets where user_id=p_user_id for update;
 if (select balance_sar from public.apex_wallets where user_id=p_user_id)<v_total then raise exception 'رصيد المحفظة غير كافٍ'; end if;
 update public.apex_wallets set balance_sar=balance_sar-v_total,updated_at=now() where user_id=p_user_id;
 insert into public.apex_orders(user_id,customer_name,phone,address,items,notes,status,total_sar,payment_method,payment_status,shipping_status,checkout_request_id)
 values(p_user_id,trim(p_customer_name),trim(p_phone),coalesce(p_address,''),v_lines,coalesce(p_notes,'')||E'\nطريقة الدفع: محفظة APEX\nطريقة الشحن: '||coalesce(p_shipping_method,''),'new',v_total,'wallet','paid','order_received',p_request_id) returning id into v_order_id;
 insert into public.apex_wallet_transactions(user_id,amount_sar,transaction_type,description,reference_type,reference_id)
 values(p_user_id,v_total,'purchase','شراء الطلب رقم #'||v_order_id,'order',v_order_id::text);
 insert into public.apex_order_status_history(order_id,status,note,changed_by) values(v_order_id,'new','تم استلام الطلب والدفع من محفظة APEX',p_user_id);
 return v_order_id;
end; $$;
revoke all on function public.apex_wallet_checkout_backend(uuid,text,text,text,text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.apex_wallet_checkout_backend(uuid,text,text,text,text,jsonb,text,uuid) to service_role;