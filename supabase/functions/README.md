# APEX Supabase Edge Functions archive

These sources were fetched from the currently deployed Supabase project on 2026-11-09.
They preserve the deployed function versions; they are source backups, not a redeployment.

| Function | Deployed version | JWT verification |
|---|---:|---|
| apex-wallet-checkout | 8 | true |
| apex-create-order | 7 | true |
| apex-admin-customers | 7 | true |
| apex-ai-guard | 10 | false (the handler validates its own authorization/cron secret) |
| apex-email-campaign | 8 | true |
| apex-store-assistant | 11 | false (the handler validates the user token itself) |

Each function's entry point is stored at `supabase/functions/<function-name>/index.ts`.
The JWT settings are preserved in `supabase/config.toml`.

## Recovery and deployment notes

- Keep all secrets in Supabase project secrets; never commit service-role keys, OpenAI keys, Resend keys, or cron secrets.
- Before deploying, inspect the target function's source, required secrets, and JWT behavior.
- Check the installed Supabase CLI version and its `functions deploy --help` output first. Supabase CLI v3 changed remote-target flags; do not copy old v2 commands blindly.
- The six deployed versions above were archived only. No Edge Function was redeployed in this recovery task.
