# APEX Supabase Edge Functions — production source archive

The six sources below were compared with the live Supabase project on 2026-11-12. Each repository file matches the currently deployed source.

| Function | Live version | JWT verification |
|---|---:|---|
| apex-wallet-checkout | 8 | true |
| apex-create-order | 7 | true |
| apex-admin-customers | 7 | true |
| apex-ai-guard | 12 | false (the handler validates user/admin or cron authorization) |
| apex-email-campaign | 9 | true |
| apex-store-assistant | 16 | true |

Each entry point is stored at `supabase/functions/<function-name>/index.ts`. The JWT settings are preserved in `supabase/config.toml`.

## Deployment safety
- These are source archives; do not redeploy just because this README changes.
- Keep all service-role keys, gateway credentials, OpenAI keys, Resend keys, and cron secrets in Supabase project secrets.
- Before any function deployment, compare its source with the live version, verify required secrets and JWT settings, and run integration tests.
- Firebase is not part of the active APEX architecture.
