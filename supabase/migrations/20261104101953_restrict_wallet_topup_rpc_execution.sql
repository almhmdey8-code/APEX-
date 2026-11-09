
revoke all on function public.apex_request_wallet_topup(numeric,bigint,text) from public, anon;
grant execute on function public.apex_request_wallet_topup(numeric,bigint,text) to authenticated;

revoke all on function public.apex_admin_review_wallet_topup(bigint,text,text) from public, anon;
grant execute on function public.apex_admin_review_wallet_topup(bigint,text,text) to authenticated;
