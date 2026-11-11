# APEX integration and release audit — 2026-11-12

## Production architecture

- Repository: `almhmdey8-code/APEX-`.
- Customer storefront: `https://almhmdey8-code.github.io/APEX-/` (`index.html`).
- Separate administrator console: `https://almhmdey8-code.github.io/APEX-/admin.html` (`admin.html`).
- Privacy policy: `https://almhmdey8-code.github.io/APEX-/privacy.html`.
- Supabase is the only active backend. Firebase migration was cancelled; no Firebase source is retained in this repository.
- Supabase project ref: `ulzxdvtzziydhuvennzw`.
- The repository contains 38 migration files matching all 38 versions in the live Supabase migration ledger.
- Six Edge Functions are ACTIVE and their archived `index.ts` sources match the deployed versions:
  - `apex-wallet-checkout` v8
  - `apex-create-order` v7
  - `apex-admin-customers` v7
  - `apex-ai-guard` v12
  - `apex-email-campaign` v9
  - `apex-store-assistant` v16

## Verification completed

- GitHub Actions storefront validation passed on commit `47dd704942d56e92c46e36f79d904ec03ba191dd`.
- GitHub Pages deployment completed successfully for that commit.
- Static validation checks both HTML pages, unique IDs, JavaScript module syntax, local resource links, inline handler exports, public-key boundaries, payment-country filtering, six Supabase function sources, and critical migration presence.
- Both storefront and admin HTML have unique IDs; all inline button handlers detected by the validator are exposed correctly.
- Fixed missing global exports for wallet QR scanning and wallet-to-wallet transfer buttons.
- Fixed signed-in referral tracking permission: both `anon` and `authenticated` now have the intended execute permission.
- Added server-side country checks to manual order checkout and wallet top-up. Controlled rollback tests confirmed a Saudi/default-SA account is rejected when attempting to use the Yemen-only Kuraimi method; no test order or top-up was retained.
- A simulated authenticated user with an unrelated UUID could read zero orders, wallets, or top-ups. Direct anonymous access to customer order tables is denied.
- Reconciled the migration archive: restored two previously missing applied migrations, removed one unapplied duplicate draft, and archived the new referral and payment-country fixes.

## Release blockers and outstanding work

### Payments

- Saudi Mada, Visa, and Google Pay entries exist but are disabled and have no configured gateway provider or completed webhook integration.
- Apple Pay is excluded from the customer checkout interface.
- Yemen manual methods exist: Kuraimi, Jeeb, One Cash, and Amri Cash. Kuraimi is the only enabled method.
- Kuraimi has account-number records for YER, SAR, and USD, but no account-holder name is stored. Jeeb, One Cash, and Amri Cash currently have no account numbers or three-currency account configuration.
- The order backend currently supports manual payment methods; gateway methods must not be enabled until provider API integration, signed webhook verification, duplicate-event protection, and end-to-end payment tests are complete.

### Shipping

- Four Saudi carriers are listed: Aramex, SPL, SMSA, and Naqel. All are disabled and marked `not_configured`.
- No Yemen shipping providers are configured.
- No live carrier API, label creation, rate quote, or tracking webhook has been certified. Do not present a carrier as active until its credentials and test shipment are verified.

### Product catalog

- The database has 21 product records: 19 active and 2 inactive.
- Four active products have very short descriptions. Current active products have prices and HTTPS image URLs.
- The product table currently stores only ID, name, category, description, image URL(s), price, active status, stock, and timestamps. It does not yet provide structured SKU, brand, model, variants, detailed specifications, dimensions, shipping weight, warranty, origin, barcode, ratings, or reviews.
- The production catalog APEX-101 to APEX-200 is not present as a complete verified catalog. Do not invent product data or replace it with demo descriptions.

### Security

- Customer RLS policies restrict orders, wallets, and top-ups to the signed-in owner; admin policies require membership in `apex_admins`.
- The requested QR-based trusted-device binding for the administrator is not implemented: no device-binding table or pairing flow exists. A front-end-only QR would not be sufficient; this must be enforced server-side and against direct database access.
- Supabase Auth leaked-password protection is currently disabled and should be enabled before launch.
- Supabase security advisor reports nine authenticated SECURITY DEFINER functions and one anonymous referral SECURITY DEFINER function. The privileged admin functions inspected check admin membership; customer operations check authentication/ownership. Keep these grants narrowly scoped.
- `apex_email_cron_auth` has RLS enabled without policies; it is intended for service-role-only access.
- The `pg_net` extension-in-public warning and RLS/performance advisor warnings remain for review.

### AI and email

- The store assistant authenticates correctly, but live logs show OpenAI `429 credit_balance_exhausted`; it falls back instead of providing the intended live AI response.
- Actual email OTP delivery, password-reset delivery, and campaign delivery still require a real mailbox/provider test. A deployed function alone does not prove email deliverability.

### Legal and real-device testing

- `privacy.html` is linked and signup requires explicit consent. The privacy page still needs a confirmed public contact channel for privacy requests and the store's legal/operator details.
- JavaScript syntax and static integration checks pass, but a complete visual and interactive browser test on Android has not been completed.
- Do not perform real payment, wallet transfer, shipping-label, or customer email tests against production without a dedicated test account and an approved test transaction.

## Android app

- The repository includes a standalone Android WebView wrapper under `android/`; it opens the HTTPS storefront and requires an internet connection.
- The current Gradle release build uses the debug signing configuration. It is suitable for a test APK only, not a Play Store production release. A private production signing key and device testing are still required.
- The web storefront and administrator console remain separate; the customer app must not expose the admin page in its navigation.

## Launch decision

**APEX is not ready for public launch yet.** The core storefront, admin console, Supabase functions, migration archive, and static validation are in place. Launch must wait for verified production products, payment gateway/webhook setup, enabled and tested shipping providers for the intended countries, administrator device binding, leaked-password protection, and real-device/email/payment/shipping end-to-end tests.
