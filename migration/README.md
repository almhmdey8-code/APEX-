# APEX Supabase → Firestore data import

This is a controlled, one-time import of the 18 public application tables inspected in the
source Supabase project into Firestore collections in Firebase project `apex-3c12f`.

## Safety

- The script refuses to run unless `--apply` is supplied.
- It uses deterministic document IDs based on each table's primary key, so reruns
  replace the same documents instead of duplicating them.
- It never prints credentials.
- Payment method documents are allow-listed to omit secret-key-name metadata and
  integration test timestamps.
- Private webhook/gateway/shipping and email cron-auth records are deliberately excluded; they require a separate server-only migration path and must not be exposed through the Data API.
- This import does not delete or modify source Supabase data.

## Required GitHub Actions secrets

- `FIREBASE_SERVICE_ACCOUNT`: Firebase service-account JSON (already added by owner).
- `SUPABASE_SERVICE_ROLE_KEY`: source project's service-role/secret key. The source URL is already set in the workflow.

Add the Supabase service-role key directly in GitHub repository Actions secrets.
Never paste it into chat, source files, issues, or logs.

## Run

Open Actions → “Import APEX data to Firestore” → Run workflow and enter
`IMPORT_APEX_DATA` as the confirmation value. Review the imported counts and
`_migrationControl/supabaseImport` manifest afterwards.

## Not included

Supabase Auth users/password hashes, private payment/webhook/shipping records, email cron-auth records, Storage file bytes, Edge Function secrets,
payment-provider credentials, scheduled cron jobs, database sequences, and client
application endpoint changes. Existing Supabase remains the live production backend
until these are separately migrated and verified. Do not switch production traffic
based only on this data import.
