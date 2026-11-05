-- APEX pre-release security hardening.
-- All order, wallet, referral and audit mutations are performed by trusted
-- Edge Functions, SECURITY DEFINER RPCs with explicit checks, or database triggers.
-- Keep customer/admin read access and admin-managed catalog writes intact.

-- Public visitors must not write to catalog, payment configuration, or settings.
revoke insert, update, delete, truncate, references, trigger
  on table public.apex_products, public.apex_banners,
            public.apex_payment_methods, public.apex_store_settings,
            public.apex_shipping_providers, public.apex_email_settings
  from anon;

-- Orders are created only through authenticated Edge Functions and backend RPCs.
revoke insert, delete, truncate, references, trigger
  on table public.apex_orders
  from anon, authenticated;

-- Financial and referral records are server-managed. Customers retain SELECT
-- through their existing RLS policies; admins retain the existing admin views.
revoke insert, update, delete, truncate, references, trigger
  on table public.apex_wallets, public.apex_wallet_transactions,
            public.apex_wallet_topups, public.apex_referral_codes,
            public.apex_referral_signups, public.apex_referral_visits,
            public.apex_order_refunds, public.apex_order_status_history,
            public.apex_security_events
  from anon, authenticated;

-- Admin membership is managed out-of-band, never from the browser.
revoke insert, update, delete, truncate, references, trigger
  on table public.apex_admins
  from anon, authenticated;

-- This table stores only the server-side cron authentication digest.
revoke all on table public.apex_email_cron_auth from anon, authenticated;

-- Trigger-only SECURITY DEFINER functions must not be callable as RPC endpoints.
create or replace function public.apex_log_order_payment_security()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event text;
begin
  if tg_op = 'INSERT' or new.payment_status is distinct from old.payment_status then
    v_event := case
      when lower(coalesce(new.payment_status,'')) in ('paid','succeeded','completed','verified') then 'payment_verified'
      when lower(coalesce(new.payment_status,'')) in ('failed','rejected','cancelled','refunded') then 'payment_rejected'
      else 'payment_pending'
    end;
    insert into public.apex_security_events(event_type,severity,user_id,source,details)
    values(
      v_event,
      case when v_event='payment_rejected' then 'warning' else 'info' end,
      new.user_id,
      'database_trigger',
      jsonb_build_object(
        'record_type','order',
        'order_id',new.id,
        'payment_status',new.payment_status,
        'amount_sar',new.total_sar,
        'payment_method',new.payment_method
      )
    );
  end if;
  return new;
end
$function$;

create or replace function public.apex_log_topup_payment_security()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event text;
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    v_event := case
      when lower(coalesce(new.status,'')) in ('approved') then 'payment_verified'
      when lower(coalesce(new.status,'')) in ('rejected','cancelled') then 'payment_rejected'
      else 'payment_pending'
    end;
    insert into public.apex_security_events(event_type,severity,user_id,source,details)
    values(
      v_event,
      case when v_event='payment_rejected' then 'warning' else 'info' end,
      new.user_id,
      'database_trigger',
      jsonb_build_object(
        'record_type','wallet_topup',
        'topup_id',new.id,
        'status',new.status,
        'amount_sar',new.amount_sar,
        'payment_method',new.payment_method_name,
        'provider_payment_id',new.provider_payment_id
      )
    );
  end if;
  return new;
end
$function$;

revoke all on function public.apex_log_order_payment_security() from public, anon, authenticated;
revoke all on function public.apex_log_topup_payment_security() from public, anon, authenticated;
grant execute on function public.apex_log_order_payment_security() to service_role;
grant execute on function public.apex_log_topup_payment_security() to service_role;
