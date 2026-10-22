# CRM Development

This is a runnable Next.js 16 App Router port of `Interior-Blinds-CRM-Purchase-Orders.html`. It preserves the supplied design, demo records, role controls, purchasing, returns, reports, chat, and browser-based workflows.

## Run locally

Install Node.js 20.9 or newer (Node 24 LTS recommended).

```bash
npm ci
npm run dev
```

Copy `.env.example` to `.env.local` and add the public URL and publishable key for the existing Supabase project. Open http://localhost:3000/login and sign in with an active CRM account. All roles, including Super Admin, use `/crm/dashboard`. Legacy `/owner` links redirect into the normal CRM routes.

Account management uses the signed-in session, `get_access_context`, the deployed account RPCs, and the `owner-change-password` function. The existing five-tab Master Control, registry-wide controls and audited impersonation are restored in source, with a focused backend extension pending release. See [account-management behavior](docs/ACCOUNT-MANAGEMENT.md) and [restoration, verification and deployment details](docs/MASTER-CONTROL-RESTORATION.md).

Warehouse inventory is connected to the already deployed v1 snapshots and ten inventory/warehouse RPCs, private image gallery, exact barcode lookup and retry-safe manual stock operations. No database SQL needs to be rerun. The older `20261021084740_warehouse_inventory.sql` proposal conflicts with the deployed snapshot contract and must not be pushed blindly. See [warehouse inventory and release verification](docs/WAREHOUSE-INVENTORY.md) for behavior, preserved workflows, migration reconciliation and remaining deployment checks.

Conditional repair/installation/supply stages, management stage/product editing, and evidence-location retry extend the existing Jobs workflow. The focused backend extension and two reviewed existing-job corrections are pending release. See [job stages and deployment](docs/JOB-STAGES.md).

Completed-job approval is separate from operational status, with permission checks, review notes/history, evidence/returns review and persistent notifications. The targeted approval migration is prepared for release; existing completed jobs start pending. See [job approval and deployment verification](docs/JOB-APPROVAL.md).

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

Supabase Auth, cookie-backed sessions, account recovery, and the existing `profiles`/`roles` authorization foundation are connected. The publishable key is safe for browser use; never expose a secret or service-role key. Operational records use the authenticated CRM store; inventory uses the inspected normalized snapshots/RPCs and private Storage. Some older workflow integrations and email delivery still require the release work documented for each module.

## Production integration phase

The restored migration is in `supabase/migrations/202608140001_auth_foundation.sql`. Apply it only to a new project or through the normal Supabase migration workflow; it is idempotent for the existing auth foundation. See `docs/INTEGRATION-HANDOFF.md` for the remaining operational integrations.

## Deploy

This uses normal Next.js deployment, not static HTML export. Configure both public Supabase environment values in the deployment and use `npm run build`. For a Node host, run the production build followed by `npm start`. HTTPS is needed for camera/geolocation outside localhost.
