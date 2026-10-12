# Interior Blinds CRM — Next.js project

This is a runnable Next.js 16 App Router port of `Interior-Blinds-CRM-Purchase-Orders.html`. It preserves the supplied design, demo records, role controls, purchasing, returns, reports, chat, and browser-based workflows.

## Run locally

Install Node.js 20.9 or newer (Node 24 LTS recommended).

```bash
npm ci
npm run dev
```

Open http://localhost:3000. Choose Admin, Manager, or Installer; the demo password is `demo123`.

For Super Admin, open http://localhost:3000/owner. The existing designated owner email is prefilled; set a **local prototype password** of at least 12 characters on first use. This is separate from your Supabase account password. The former email-based URL redirects to `/owner`.

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

The source's embedded live Supabase URL/key and automatic hosted-owner authentication were removed. **No Supabase database, Auth, Storage, email worker, or production API is connected.** Prototype permissions and passwords are browser controls and are not production authorization. Email delivery behavior remains the source prototype behavior.

## Production integration phase

Implement server-verified authentication, RLS-backed reads, and atomic workflow commands before using this with real staff or customer data. See `docs/INTEGRATION-HANDOFF.md`. The database upgrade already applied in the earlier phase is separate from this project; this conversion applies no migrations.

## Deploy

This uses normal Next.js deployment, not static HTML export. For Vercel, import the project, choose Next.js, and use `npm run build`; no environment variables are needed for this prototype. For a Node host, run the production build followed by `npm start`. HTTPS is needed for camera/geolocation outside localhost. This delivery does not publish or deploy the project.
