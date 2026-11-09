
create unique index if not exists apex_wallet_topups_provider_payment_uidx
on public.apex_wallet_topups(provider_payment_id)
where provider_payment_id is not null and btrim(provider_payment_id) <> '';

create or replace function public.apex_log_order_payment_security()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_event text;
begin
  if tg_op = 'INSERT' or new.payment_status is distinct from old.payment_status then
    v_event := case
      when lower(coalesce(new.payment_status,'')) in ('paid','succeeded','completed','verified') then 'payment_verified'
      when lower(coalesce(new.payment_status,'')) in ('failed','rejected','cancelled','refunded') then 'payment_rejected'
      else 'payment_pending'
    end;
    insert into public.apex_security_events(event_type,severity,user_id,source,details)
    values(v_event,case when v_event='payment_rejected' then 'warning' else 'info' end,new.user_id,'database_trigger',
      jsonb_build_object('record_type','order','order_id',new.id,'payment_status',new.payment_status,'amount_sar',new.total_sar,'payment_method',new.payment_method));
  end if;
  return new;
end $$;

drop trigger if exists apex_order_payment_security_log on public.apex_orders;
create trigger apex_order_payment_security_log
after insert or update of payment_status on public.apex_orders
for each row execute function public.apex_log_order_payment_security();

create or replace function public.apex_log_topup_payment_security()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_event text;
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    v_event := case
      when lower(coalesce(new.status,'')) in ('approved') then 'payment_verified'
      when lower(coalesce(new.status,'')) in ('rejected','cancelled') then 'payment_rejected'
      else 'payment_pending'
    end;
    insert into public.apex_security_events(event_type,severity,user_id,source,details)
    values(v_event,case when v_event='payment_rejected' then 'warning' else 'info' end,new.user_id,'database_trigger',
      jsonb_build_object('record_type','wallet_topup','topup_id',new.id,'status',new.status,'amount_sar',new.amount_sar,'payment_method',new.payment_method_name,'provider_payment_id',new.provider_payment_id));
  end if;
  return new;
end $$;

drop trigger if exists apex_topup_payment_security_log on public.apex_wallet_topups;
create trigger apex_topup_payment_security_log
after insert or update of status on public.apex_wallet_topups
for each row execute function public.apex_log_topup_payment_security();
