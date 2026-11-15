# APEX Native App

A separate React Native + Expo application for Android and iOS. This app is developed independently from the live storefront and admin console.

## Current design milestone

- APEX customer home screen styled in royal gold and black, silver-white, and sapphire-blue glass.
- Preserves the approved home-screen order: top bar, royal hero, four service shortcuts, categories, offers, APEX features, and the five-item bottom navigation.
- Customer app only. The admin console is not included.
- Existing Supabase storefront, database, Edge Functions, payments, and shipping configuration are not modified.

## Development status

This branch contains the visual home-screen milestone. Service actions are still placeholders; authentication, live catalog, cart persistence, orders, shipping tracking, and APEX AI require separate integration and testing against the existing Supabase contracts.

No Firebase migration, service-role key, payment secret, or production credential is included in the app.
