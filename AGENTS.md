# Project rules

After completing updates, unless explicitly told not to, deploy the web build and install the mobile build on a phone.

When a request involves Flutter, always ask whether it is for phone, web, windows, or another platform before proceeding.

## Bible version licensing notes

- YouVersion Platform API gates content per license. As of the latest audit on 2026-08-23 (`GET /v1/licenses` via the proxy), 10 licenses are defined and none have been agreed to (`agreed_dt` is null for all). The current English probe shows 19 working versions and only 3 failing: TPT (1849) is in license 4 (BroadStreet Publishing Fast-track), PEV (2530) is in license 7 (Wycliffe Fast-track), and TCENT (3427) is in license 1 (Public Domain and Creative Commons). Most other versions work because `resolveVersionSources` falls back to API.Bible, bible-api.com, NLT.TO, or local KJV/NLT.
- To make the failing YouVersion versions available, the account owner needs to agree to the relevant licenses in the YouVersion Platform dashboard at `platform.youversion.com` (license 1 for TCENT, license 4 for TPT, license 7 for PEV).
- API.Bible entitlements for AMP, TPT, NASB, and EASY are no longer the current bottleneck for the English probe; AMP, NASB 1995/2020, and EASY are already working. Only TPT remains blocked by the YouVersion license above.
