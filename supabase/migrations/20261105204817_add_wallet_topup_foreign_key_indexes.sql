create index if not exists apex_wallet_topups_payment_method_id_idx
  on public.apex_wallet_topups (payment_method_id);
create index if not exists apex_wallet_topups_reviewed_by_idx
  on public.apex_wallet_topups (reviewed_by);
