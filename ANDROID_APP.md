# APEX Android app

This repository is prepared for a standalone Android application based on the new APEX storefront. It is independent of any earlier application. The app opens the published HTTPS storefront in Android WebView. The separate administrator page remains available at `https://almhmdey8-code.github.io/APEX-/admin.html`, and the privacy policy is served at `privacy.html`. The app requires an internet connection. Payment methods and gateways remain intentionally deferred and are not changed.

The release APK must be built and verified by CI before it is presented as ready to install. Play Store publication requires a private production signing key; a CI test APK can use a temporary debug signing key.
