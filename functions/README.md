# APEX Firebase Functions

The Firebase backend lives in this folder and deploys to project `apex-3c12f`, region `us-central1`.

## Callable functions

- `apexCreateOrder`: validates active products and manual payment method, snapshots server prices, and creates an idempotent pending order.
- `apexWalletCheckout`: same validation plus an atomic wallet debit and ledger entry.
- `apexAdminCustomers`: admin-only customer and order summary.
- `apexAiGuard`: rate-limited security event collection and admin security report.
- `apexEmailCampaign`: owner/admin-only campaign to email-verified customers who opted in.
- `apexStoreAssistant`: authenticated store assistant with user-scoped order lookup.
- `apexRequestSignupOtp` / `apexCompleteSignup`: six-digit, expiring, one-time email verification and Firebase account creation.

## Required Firebase setup

1. Enable Email/Password in Firebase Authentication.
2. Create Firestore and Storage in `apex-3c12f`.
3. Register the web app and add its public config to the ignored local file `firebase/runtime-config.js`.
4. Set the secrets before deployment:
   - `firebase functions:secrets:set RESEND_API_KEY`
   - `firebase functions:secrets:set OPENAI_API_KEY`
   - `firebase functions:secrets:set APEX_SECURITY_HASH_SALT`
5. Add the initial trusted administrator document in Firestore at `admins/{firebaseAuthUid}` with `{ "active": true, "role": "admin" }`. Do this only for the verified store owner. The client cannot write this collection.
6. Deploy only after emulator/integration tests and review: `firebase deploy --only functions,firestore:rules,storage`.

No payment gateway credentials are stored in Firestore public documents or browser code. Gateway integrations and webhooks still require provider credentials and separate end-to-end certification; the current order function intentionally accepts manual methods only. Existing Supabase data is not deleted or modified by this code.
