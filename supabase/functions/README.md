# APEX Supabase Edge Functions — production source archive

All seven function sources below were compared with the live Supabase project on 2026-11-13. The archived `index.ts` files match the deployed sources.

| Function | Live version | JWT verification |
|---|---:|---|
| apex-wallet-checkout | 10 | true |
| apex-create-order | 9 | true |
| apex-admin-customers | 10 | true |
| apex-ai-guard | 23 | false (the handler validates customer/admin or cron authorization) |
| apex-email-campaign | 12 | true |
| apex-store-assistant | 30 | true |
| apex-product-analyze | 6 | true |

Each entry point is stored at `supabase/functions/<function-name>/index.ts`. JWT settings are preserved in `supabase/config.toml`.

## Deployment safety
- These files are source archives; do not redeploy just because this README changes.
- Keep service-role keys, gateway credentials, Gemini/OpenAI keys, Resend keys, and cron secrets in Supabase project secrets.
- Before any function deployment, compare its source with the live version, verify required secrets and JWT settings, and run integration tests.
- Firebase is not part of the active APEX architecture.
