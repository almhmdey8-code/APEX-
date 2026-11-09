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

## Migration history caveat

The live Supabase migration history contains 33 recorded versions. The repository now contains 7 SQL migration files; 26 historical SQL migration files are still missing. The newly recorded direct database changes are now captured in the migration above, but the missing historical SQL source files cannot be reconstructed byte-for-byte from the migration version/name ledger alone. Do not reset or recreate the production database from this partial migration directory until the remaining historical migrations or a complete schema/data backup have been recovered.

## Production data safety

- No customer orders, balances, product quantities, or customer accounts were bulk-modified by the recovery tests.
- Inventory tests used nested transactions that were intentionally rolled back.
- Never commit Supabase service-role keys or provider secrets to this repository.
