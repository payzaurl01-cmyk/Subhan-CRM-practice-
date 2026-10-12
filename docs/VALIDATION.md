# Conversion validation

Revalidated on 12 October 2026 using Node.js 22.21.0, Next.js 16.4.0, React 19.3.0, and Chromium through Playwright.

- Production build: passed.
- Next.js/TypeScript application type check: passed. Original JavaScript workflows retain dynamic data shapes and are not checked with `checkJs`.
- Automated route/lifecycle checks: 2 passed.
- Browser workflow checks: 7 passed.
- Supabase login, signup, password-recovery, callback/session wiring, protected-route redirect, and environment detection were validated without changing live data.
- All 18 Admin screens rendered without uncaught browser errors.
- Tested navigation, back history, reload persistence, unknown routes, lead creation, client reporting, supplier creation, PO receipt/stock movements, Installer restrictions, local owner setup, owner reload, and mobile navigation.
- Visually reviewed desktop dashboard, purchasing, and mobile purchasing in the production build.
- Owner setup test confirmed no requests to the live Supabase endpoint.

These checks validate representative prototype workflows. They do not validate live Supabase Auth/RLS/Storage, email delivery, real cameras/barcode devices, device geolocation, multi-user concurrency, or every financial/return edge case. Those belong to the integration phase.
