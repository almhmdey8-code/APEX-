# APEX integration and release audit — 2026-11-13

## Production architecture

- Repository: `almhmdey8-code/APEX-`, default branch `main`.
- Customer storefront: https://almhmdey8-code.github.io/APEX/
- Administrator console: https://almhmdey8-code.github.io/APEX-/admin.html
- Product Studio: https://almhmdey8-code.github.io/APEX-/product-studio.html (requires an authenticated administrator session and MFA AAL2).
- Privacy policy: https://almhmdey8-code.github.io/APEX-/privacy.html
- Supabase is the only active backend. Firebase is not part of the production architecture.
- Supabase project ref: `ulzxdvtzziydhuvennzw`; project status was `ACTIVE_HEALTHY` during this audit.
- The live migration ledger contains 46 applied migrations. The repository archive has been reconciled to those 46 versions. Five missing applied SQL bodies were recovered from the live migration ledger; two unrecorded duplicate draft files were removed.
- Seven Edge Functions are ACTIVE. Their repository entry points now match the live deployed source:
  - `apex-wallet-checkout` v10 — JWT required
  - `apex-create-order` v9 — JWT required
  - `apex-admin-customers` v10 — JWT required
  - `apex-ai-guard` v23 — JWT disabled; the handler performs its own authorization
  - `apex-email-campaign` v12 — JWT required
  - `apex-store-assistant` v30 — JWT required
  - `apex-product-analyze` v6 — JWT required
- `supabase/config.toml` now records the deployed JWT behavior for all seven functions, including the previously omitted product-analysis function.

## Work completed in this audit

- Compared all seven deployed Edge Function sources with the repository. The live assistant source had drifted from its archived version; the exact deployed v30 source has now been archived.
- Recovered the five missing applied migration files directly from `supabase_migrations.schema_migrations.statements`; no production migration was re-applied.
- Removed two unrecorded duplicate migration drafts whose contents were superseded by the actual applied migration versions.
- Added `apex-product-analyze` to Supabase JWT configuration and the automated source checks.
- Expanded storefront validation to include `product-studio.html` and all seven Edge Function source files.
- Updated the README and function archive documentation to reflect the actual production system.
- Corrected the live product catalog state: 23 active records with no usable price/stock/image combination were hidden from the customer storefront. Records previously marked `published` without a sellable price or stock were returned to `awaiting_shipping_check`; no product rows were deleted and no prices or stock values were invented.

## Current catalog status

- The database contains 54 product records: 19 active and 35 inactive.
- All 19 active records currently have a non-null price, positive stock, and at least one image URL. This is structural completeness only; supplier availability, exact specifications, and actual stock still require business verification.
- All 19 active descriptions are short (under 80 characters). They need accurate, product-specific details before the catalog can be considered complete.
- Ten AliExpress import jobs remain in `waiting_credentials`; none has imported products. The automatic AliExpress catalog is therefore not connected.
- Product Studio supports up to five uploaded images and a requested batch of 1–20 draft products. It uses the protected `apex-product-analyze` function and saves drafts as inactive. The current suggested price calculation is cost + 50 SAR and stores zero shipping allowance; shipping cost is not automatically included. Review this pricing rule before relying on it for real orders.
- Do not label the 19 manual catalog entries as supplier-verified until their source, specifications, and stock are checked.

## Payments — intentionally not activated

- Saudi Mada, Visa, and Google Pay are present but disabled; no gateway provider or signed payment webhook has been certified.
- Apple Pay remains excluded from customer checkout.
- Yemen Kuraimi is the only enabled manual payment method and has account records for YER, SAR, and USD. The account-holder name is not configured.
- Jeeb, One Cash, and Amri Cash are disabled and their account records are not populated in the live database.
- Manual transfers remain pending until the administrator verifies receipt. No screenshot is treated as final payment proof.
- Payment work remains paused as previously requested. Do not enable any method or process a live transaction until provider details and test approvals are ready.

## Shipping

- Saudi carrier records exist for Aramex, SPL, SMSA, and Naqel; all four are disabled and `not_configured`.
- No Yemen carrier integration is configured. No live rates, labels, carrier API, or tracking webhook has been certified.
- The Riyadh warehouse address is intentionally blank, pending the administrator entering the real address later. No placeholder address was inserted.
- Saudi orders are routed directly to the customer's delivery address. Yemen orders are routed through the APEX Riyadh hub and are blocked until the real warehouse address is entered.
- Do not promise delivery dates or fees until carrier coverage and rates are confirmed.

## Security and database

- RLS is enabled on all exposed `public` business tables; private transaction tables remain in the private schema.
- The administrator trusted-device flow is now implemented server-side: trusted-device and short-lived invite tables exist, pairing/list/revoke functions require admin MFA AAL2, and direct table access is revoked from `anon` and `authenticated`.
- The three RLS-enabled tables with no policies are `apex_admin_device_invites`, `apex_admin_trusted_devices`, and `apex_email_cron_auth`. They are intentionally service-role-only; do not add broad client policies just to silence the INFO finding.
- Security Advisor still reports an anonymous SECURITY DEFINER referral-visit function (needed for public referral-link tracking) and 15 authenticated SECURITY DEFINER functions. These functions require continued review of their internal owner/admin checks and narrow grants; do not blanket-revoke them because that would break intended workflows.
- Remaining Advisor items include `pg_net` in the public schema, RLS init-plan/permissive-policy performance warnings, three unindexed foreign keys, and unused indexes. These are cleanup items, not a reason to weaken RLS.
- The prior audit flagged leaked-password protection as disabled. Recheck and enable it in Supabase Auth before public launch; this setting was not independently verified through the available project inspection tools during this pass.

## AI assistant and email

- The live `apex-store-assistant` v30 reads the customer's authenticated order data and current catalog, payment, currency, category, shipping, and warehouse settings.
- Its system instructions include APEX identity, store scope, privacy, account security, pricing, payment, Saudi/Yemen shipping routes, cancellation, returns/refunds, referrals, and rules against inventing missing information.
- Gemini is the active AI provider path: `gemini-3.8-flash` is attempted first, with `gemini-3.5-flash-lite` and `gemini-3.7-flash` failover. If the Gemini secret is missing or every provider attempt fails, the function deliberately returns the local store-data fallback. The presence/value of the secret and a successful signed-in live conversation were not verified in this audit.
- The previous OpenAI credit-exhaustion report is not a description of the current assistant implementation; the current deployed function uses Gemini.
- Email OTP, password reset, and campaign delivery still need a real end-to-end mailbox test. A deployed email function alone does not prove delivery.

## Legal, browser, and Android testing

- The privacy policy is linked and signup requires explicit consent.
- Confirm the legal/operator details and the public channel for privacy requests before launch.
- Automated static validation checks customer, admin, and product-studio pages, IDs, JavaScript module syntax, local links, privileged-key boundaries, inline handlers, country-scoped payment filtering, and all seven function sources.
- A complete real-device Android browser test and authenticated customer/admin journey test have not been completed in this pass.
- The Android wrapper remains internet-only. Its current release build uses debug signing and is suitable for testing only; production distribution requires a private release keystore and device testing.
- Do not run live payment, wallet-transfer, carrier-label, or customer-email tests against production without a dedicated test account and an approved test transaction.

## Launch decision

**APEX is not ready for public launch yet.** The source archive, function inventory, migration archive, product visibility cleanup, and static checks have been brought into line. Remaining launch blockers are real supplier-verified products and full descriptions, AliExpress credentials/import, payment provider/webhook setup, shipping carrier configuration, the real Riyadh warehouse address for Yemen orders, Auth leaked-password protection, verified email delivery, legal/operator details, and end-to-end real-device tests.
