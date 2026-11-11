# APEX Supabase recovery notes

Project ref: `ulzxdvtzziydhuvennzw`

## Current recovery work (2026-11-09)

- Archived the source for all six active deployed Edge Functions under `supabase/functions/`.
- Added `supabase/config.toml` with the deployed JWT verification settings.
- Added migration `20261109151318_apex_inventory_reservation_and_recovery_hardening.sql`.
- Inventory is decremented atomically when a new manual-payment or wallet order is created.
- A cancelled order restores its reserved quantities once. A product return does not restock inventory until the item is physically received; this is intentionally separate from wallet refund escrow.
- Repeated checkout requests are serialized with a transaction advisory lock to prevent duplicate reservations.
- The current stock values were not bulk-adjusted for historical orders because the database does not establish whether old orders had already been deducted from stock. The new rule applies to orders created after this migration.
- Unpaid manual-transfer orders keep their stock reserved until an administrator cancels them. No automatic expiry/release job was added.

## Migration history recovery — completed (2026-11-09)

- Recovered the original SQL bodies for all 26 previously missing historical migrations directly from `supabase_migrations.schema_migrations.statements` in the live Supabase project. This is the stored SQL that was applied, not a reconstruction from migration names.
- Added the 26 original files under `supabase/migrations/` using their exact recorded version and name.
- Also recovered the previously unarchived return-escrow migration `20261109121451_apex_product_return_escrow_wallet.sql`.
- Archived the two additional migrations applied on 2026-11-11: `20261111173426_add_apex_privilege_wallet_card_number.sql` and `20261111184321_exclude_anonymous_auth_sessions_from_customer_policies.sql`.
- Removed an older unrecorded draft `20261109121000_apex_product_return_escrow_wallet.sql`; the applied return-escrow migration is `20261109121451_apex_product_return_escrow_wallet.sql`.
- Compared migration versions against the live ledger: all 37 repository migration files have matching live versions, and no live migration version is missing from the repository.
- No migration was re-applied to production during this recovery. This was a source-control archive operation only.
- The repository and live Supabase ledger now contain 38/38 matching migration versions. Keep this directory as the canonical migration history going forward.

**Safety:** Do not run `supabase db reset --remote` on production. Since these migrations are already recorded as applied, do not re-apply them to production. Use the normal local validation workflow first, then deploy only genuinely new migrations.

## Production data safety

- No customer orders, balances, product quantities, or customer accounts were bulk-modified by the recovery tests.
- Inventory tests used nested transactions that were intentionally rolled back.
- Never commit Supabase service-role keys or provider secrets to this repository.


## Referral tracking permission fix — 2026-11-12

- Live logs showed signed-in sessions receiving HTTP 403 when calling `apex_track_referral_visit` because the function execute grant covered `anon` but not `authenticated`.
- Applied migration `20261111224642_fix_referral_visit_authenticated_execute.sql` to grant execute to `authenticated` while retaining anonymous referral tracking.
- The storefront's referral tracking should be rechecked from both signed-out and signed-in browser sessions after deployment.


## Payment country enforcement — 2026-11-12

- Added server-side country checks to both manual order checkout and wallet top-up. Saudi/default-SA accounts can use only `SA` or `ALL` methods; Yemen accounts can use only `YE` or `ALL` methods.
- Tested both paths with a Saudi/default-SA account and the enabled Yemen-only Kuraimi method. Both were rejected before creating an order or wallet top-up; no test transaction was retained.
- The production gateway methods remain disabled until their provider integration and webhook verification are completed.
