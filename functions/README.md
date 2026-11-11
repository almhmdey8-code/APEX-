# APEX backend

**Supabase is the only active backend for the APEX storefront.** Firebase migration was cancelled; do not deploy or reconnect Firebase functions from this repository.

The canonical backend source is under `supabase/functions/`, with database migrations under `supabase/migrations/`. Live Edge Function versions and migration status must be checked in the Supabase project before any deployment.

Do not put service-role keys, payment gateway credentials, shipping API keys, OpenAI keys, or email provider secrets in this repository or browser code.
