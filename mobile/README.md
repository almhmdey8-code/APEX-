# APEX Native App

Separate React Native application for iOS and Android. This is a native app, not a WebView wrapper. The current storefront, admin console, Supabase functions, database, and payment settings remain unchanged.

The first commit establishes the app workspace only. Customer features will be implemented as independent native modules and integrated with the existing Supabase backend after auditing each current contract. No Firebase, service-role key, payment secret, or admin interface belongs in this client.

The initial screen is a shell only; sign-in, catalog, cart, checkout, orders, tracking, and assistant are not yet implemented.