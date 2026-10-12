# Interior Blinds CRM — Next.js project

This is a runnable Next.js 16 App Router port of `Interior-Blinds-CRM-Purchase-Orders.html`. It preserves the supplied design, demo records, role controls, purchasing, returns, reports, chat, and browser-based workflows.

## Run locally

Install Node.js 20.9 or newer (Node 24 LTS recommended).

```bash
npm ci
npm run dev
```

Copy `.env.example` to `.env.local` and add the public URL and publishable key for the existing Supabase project. Open http://localhost:3000/login and sign in with an active CRM account. Super Admin accounts are routed to `/owner`; staff accounts are routed to `/crm/dashboard`.

```bash
npm run typecheck
npm test
npm run build
npm start
```

Browser checks:

```bash
npx playwright install chromium
npm run test:e2e
```

## Project structure

- `src/app`: layout, global styles, route resolution, and error/not-found pages.
- `src/features/crm/CRMWorkspace.tsx`: React client component and mount/unmount lifecycle.
- `src/features/crm/runtime.js`: original workflow functions, browser state, and delegated actions.
- `src/features/crm/views`: screen templates split into access, operations, warehouse, finance, chat, and shell modules.
- `src/features/crm/data/seed.js`: original demo records.
- `src/features/crm/lifecycle.js`: event, timer, animation, and object URL cleanup.
- `src/features/crm/routes.js`: direct URLs and history navigation.
- `docs`: conversion inventory and remaining integration handoff.
- `tests`: route/lifecycle checks and browser workflow checks.

## Conversion boundary

Next.js and React own the page and client host. The existing CRM renders its HTML templates inside one client-only DOM island. These templates and workflows are real source modules; the app does not embed the original file in an iframe, inject script tags, or evaluate downloaded code. This is an incremental port, **not a complete rewrite of every screen into JSX components**. JavaScript workflow modules retain their original dynamic data shapes; TypeScript checks the Next.js/React application boundary.

The localStorage key remains `ibs-standalone-crm-v1`, and media uses IndexedDB `ibs-installation-media`. Existing data migrates only when it is available on the **same browser origin**; records stored under a file URL or another domain do not automatically transfer to localhost. Prototype media remains in the browser, outside the project ZIP.

Supabase Auth, cookie-backed sessions, account recovery, and the existing `profiles`/`roles` authorization foundation are connected. The publishable key is safe for browser use; never expose a secret or service-role key. CRM operational records, media, workflow commands, Storage, and email delivery remain in the prototype boundary until their existing live schemas/RPC contracts are verified and wired.

## Production integration phase

The restored migration is in `supabase/migrations/202608140001_auth_foundation.sql`. Apply it only to a new project or through the normal Supabase migration workflow; it is idempotent for the existing auth foundation. See `docs/INTEGRATION-HANDOFF.md` for the remaining operational integrations.

## Deploy

This uses normal Next.js deployment, not static HTML export. Configure both public Supabase environment values in the deployment and use `npm run build`. For a Node host, run the production build followed by `npm start`. HTTPS is needed for camera/geolocation outside localhost.
