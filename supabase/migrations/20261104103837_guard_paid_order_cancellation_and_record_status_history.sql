
create or replace function private.apex_guard_order_status_and_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled'
     and old.status is distinct from 'cancelled'
     and coalesce(old.payment_status,'pending') = 'paid' then
    raise exception 'لا يمكن إلغاء طلب مدفوع قبل تنفيذ الاسترداد الآمن';
  end if;

  if new.status is distinct from old.status then
    insert into public.apex_order_status_history(order_id,status,note,changed_by)
    values (
      new.id,
      new.status,
      case new.status
        when 'confirmed' then 'تم تأكيد الطلب من الإدارة'
        when 'processing' then 'بدأ تجهيز الطلب'
        when 'shipped' then 'تم شحن الطلب'
        when 'delivered' then 'تم تسليم الطلب'
        when 'cancelled' then 'تم إلغاء الطلب'
        else 'تم تحديث حالة الطلب'
      end,
      auth.uid()
    );
  end if;
  return new;
end;
$$;

revoke all on function private.apex_guard_order_status_and_history() from public, anon, authenticated;

drop trigger if exists apex_order_status_guard_history on public.apex_orders;
create trigger apex_order_status_guard_history
before update of status on public.apex_orders
for each row execute function private.apex_guard_order_status_and_history();
