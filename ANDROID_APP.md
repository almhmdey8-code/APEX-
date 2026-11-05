# APEX Android app

This repository is prepared for a standalone Android application based on the new APEX storefront. It is independent of any earlier application. The customer storefront, separate administrator page, and privacy policy are packaged as local WebView assets. Payment methods and gateways remain intentionally deferred and are not changed.

The release APK must be built and verified by CI before it is presented as ready to install. Play Store publication requires a private production signing key; a CI test APK can use a temporary debug signing key.
