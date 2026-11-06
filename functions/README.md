# APEX Firebase HTTPS bridge (migration phase 1)

This package exposes six Firebase HTTPS Functions with stable APEX endpoint names.
**This is a compatibility bridge, not the completed Supabase-to-Firebase backend migration.**
It forwards authenticated requests to the existing Supabase Edge Functions so the current
business rules, SQL transactions, payment verification, and admin checks remain in force
while the Firebase implementation and data migration are built and tested.

## Runtime configuration

Set these Firebase Functions parameters before deployment:

- `SUPABASE_URL`: project URL for the current APEX Supabase backend.
- `SUPABASE_ANON_KEY`: Supabase publishable/anon key (not service-role).

The caller's existing Supabase access token is forwarded unchanged and verified by the
existing Edge Function. Never add a service-role key, Resend key, OpenAI key, payment
gateway secret, or Firebase service-account JSON to source control or client code.

## Exposed endpoints

- `apexWalletCheckout`
- `apexCreateOrder`
- `apexAdminCustomers`
- `apexAiGuard`
- `apexEmailCampaign`
- `apexStoreAssistant`

All accept POST and OPTIONS. Existing clients must not be switched to these endpoints
until the Firebase functions are deployed and smoke-tested. This phase does not migrate
Firestore data, Supabase SQL/RPC logic, Auth users, triggers, or payment webhooks.
