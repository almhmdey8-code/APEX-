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
- Compared every migration file against its stored applied SQL. All 34 migration files now match the live migration ledger exactly, including the newer inventory and return-tracking migrations.
- No migration was re-applied to production during this recovery. This was a source-control archive operation only.
- The repository and live Supabase ledger now contain 34/34 matching migration versions. Keep this directory as the canonical migration history going forward.

**Safety:** Do not run `supabase db reset --remote` on production. Since these migrations are already recorded as applied, do not re-apply them to production. Use the normal local validation workflow first, then deploy only genuinely new migrations.

## Production data safety

- No customer orders, balances, product quantities, or customer accounts were bulk-modified by the recovery tests.
- Inventory tests used nested transactions that were intentionally rolled back.
- Never commit Supabase service-role keys or provider secrets to this repository.
