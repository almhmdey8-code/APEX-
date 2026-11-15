# APEX Native App

Customer-facing Android/iOS app for the existing APEX store. It is developed separately from the live storefront and admin console.

## Included app flows

- Royal black/gold, silver-white and sapphire glass visual system.
- Live active catalog from `apex_products`, live categories, banners and store exchange rate from Supabase.
- Product details, favorites, local secure cart persistence, quantity controls and checkout.
- Email one-time-code login, signup verification and password recovery using Supabase Auth.
- Customer profile stored in Supabase Auth metadata.
- Customer order history and shipping status from `apex_orders`.
- Country-specific enabled payment methods from `apex_payment_methods` (Saudi Arabia and Yemen).
- Order creation through the existing `apex-create-order` Edge Function.
- APEX AI assistant through the existing `apex-store-assistant` Edge Function.
- Wallet balance and referral code display.

## Build

A GitHub Actions workflow typechecks the app, generates the Android project with Expo Prebuild, builds an installable debug APK, and uploads it as the `APEX-Android-debug-apk` artifact.

The APK is debug-signed by Android's generated debug keystore. It can be installed for testing; upgrading an older production-signed app may require uninstalling the old app first. A production-signed release needs the owner's signing key and must not use a debug key.

## Backend and security

- Uses the existing APEX Supabase project and its public publishable key only.
- No service-role key, Firebase project, payment secret, or admin access is embedded.
- Payment methods are displayed only when enabled for the customer's selected country and marked available for orders.
- Sending an order does not mark it paid; payment remains subject to the existing store verification flow.
- The live storefront, admin panel, database schema, and Edge Functions are not modified by this app branch.
- The app is a customer client only; no admin dashboard is included.

## Release note

Android package: `com.apex.store`
Version: `1.0.1`
Version code: `7`
