# Project rules

After completing updates, unless explicitly told not to, deploy the web build and install the mobile build on a phone.

When a request involves Flutter, always ask whether it is for phone, web, windows, or another platform before proceeding.

## Bible version licensing notes

- YouVersion Platform API gates content per license. As of the latest audit (`GET /v1/licenses` via the proxy), 10 licenses are defined and none have been agreed to (`agreed_dt` is null for all). The current English probe shows 19 working versions and only 3 failing (TPT 1849, PEV 2530, TCENT 3427). Most versions work because `resolveVersionSources` falls back to API.Bible, bible-api.com, NLT.TO, or local KJV/NLT. The 3 failing versions have no working fallback.
- To make the failing YouVersion versions available, the account owner needs to agree to the relevant licenses in the YouVersion Platform dashboard at `platform.youversion.com`.
- API.Bible entitlements for AMP, TPT, NASB, and EASY also require dashboard access/approval in the API.Bible account.
