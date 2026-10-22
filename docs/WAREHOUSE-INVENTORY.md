# Warehouse inventory integration — 22 October 2026

The frontend now targets the deployed inventory v1 contract in project `moevynyglfeebzegttfl`. No database migrations, grants, policies, accounts, passwords or production inventory records were changed during this implementation. Live inspection was limited to reading function signatures, table columns and migration history. Browser mutation tests use an isolated HTTP fixture, never the live database.

## Database deployment records

The Supabase migration history confirms:

| Version (UTC)    | Applied migration                          |
| ---------------- | ------------------------------------------ |
| `20261021202308` | `add_inventory_management_and_snapshot_v1` |
| `20261021202525` | `harden_new_inventory_anonymous_guards`    |

The source handoff was `/Users/subhan/Downloads/CRM-Inventory-Backend/README.md`, with its accompanying `inventory-backend.sql`, `inventory-anonymous-guards.sql` and `verify.sql`. These are records of an already applied deployment. **Do not rerun them.**

`supabase/migrations/20261021084740_warehouse_inventory.sql` is an older, different proposal, absent from this project's applied migration history. It defines a conflicting `inventory_snapshot`, an `inventory_command` API and allocation tables that are not deployed. It remains in the repository for historical/local regression checks; it is not a prerequisite for this frontend. **Do not run an unfiltered `supabase db push` or apply that proposal to the deployed project.** No migration history was fabricated or repaired by this change. Provisioning a fresh database needs a separate, reviewed baseline matching the deployed history.

## Connected workflows

- Inventory loads one object from `inventory_snapshot`. Cards use `summary` directly, catalogue rows join `products` and `variants`, stock is grouped from `balances`, and history uses `recent_movements` with an existing-table history query for older movements. Empty arrays and zero totals render normally without inserting demo inventory.
- Products and variants save through `inventory_save_product` / `inventory_save_variant`, with strict argument objects. New products acquire their backend-created default variant; additional variants use a separate form. Product edits preserve metadata, existing variant names and explicit variant price overrides. Blank variant prices mean inheritance. No product/variant save carries quantity or image-path fields.
- Product creation and optional barcode registration are separate steps. A confirmed product UUID is retained after a barcode failure, displayed as partial completion, and reused on retry. An interrupted browser session can recover the saved product from the catalogue and register its barcode through Details. Opening stock is a separate, explicit Add Stock operation after catalogue creation.
- Warehouses and locations use `warehouse_snapshot`, `inventory_save_warehouse` and `inventory_save_location`. Addresses are nested complete address objects; edits omit the address unless replacement is explicitly selected. Creating a warehouse creates the default location on the backend. Locations support same-warehouse parent hierarchies, active/archive status and restoration. Existing locations cannot change warehouse. There are no destructive delete actions.
- Add Stock, signed adjustments and immediate transfers use only `inventory_move_stock`. The adapter accepts its scalar movement UUID. Source/destination IDs are derived from the selected locations. Quantities and reasons are validated. No direct balance writes or additional old movement calls occur.
- Before posting stock or a PO receipt, the original operation ID and payload are saved in user-scoped sessionStorage. This is only retry metadata; inventory remains server-backed. Lost responses retain an explicit Retry action across reloads in the same tab. Retries resend identical inputs and IDs. A confirmed SQL rejection clears the retry record. A new operation is blocked while an unconfirmed operation is pending.
- Handheld, manual and camera input trim the decoded value and call `inventory_lookup_barcode`. Multiple matches require an explicit variant choice; unknown codes offer authorized creation without creating anything automatically. Camera cancellation, duplicate detection and manual fallback remain supported.
- Barcode registration calls `inventory_save_barcode` with the selected variant and primary flag. Barcode registration never changes stock.
- Images upload to private `inventory-images` under the signed-in user's prefix using a unique path and `upsert:false`. JPEG, PNG, WebP and AVIF are accepted up to 10 MiB. Only after upload succeeds does `inventory_save_image` create a link. A failed link retains its uploaded path for retry; an existing link is recovered by immutable object path if the response was lost. Gallery forms edit alt text, order, primary status and archive state. A replacement is a new upload/link; archive the previous link separately. Variant galleries fall back to product images. Five-minute signed URLs are renewed before expiry while the screen is open.
- Mutations refetch after confirmation. Focus, reconnect and a 30-second timer refresh snapshots; this integration does not depend on Realtime publication. Read or mutation failures are surfaced. A confirmed permission-denied refresh clears the stale inventory view.

Category and supplier choices read existing tables through the authenticated client's RLS. Supplier choices are requested only with purchasing view permission. Missing optional choices do not clear existing category/supplier links. Warehouse-only management users can load the warehouse snapshot and manage locations from Picking without requiring inventory view.

## Preservation and permissions

The real signed-in Supabase client is used throughout. No service key, mock fallback, permission grant or duplicate schema was added. New inventory administration requires an active management role plus module view/update; create also requires create. Stock changes additionally require warehouse view. The deployed helper denies installers and anonymous sessions, including reads through the new RPCs; the UI does not broaden their access.

Existing CRM job, picking, return, finance, account, approval and purchasing document screens remain. PO receipts continue through the existing `crm_receive_po` transaction and are never also posted as manual stock. Pending normalized POs and lines are loaded from their existing RLS-protected tables. Existing document creation uses its original CRM workflow.

The older proposal's `inventory_command` allocation, inspected-return, category-creation and threshold APIs do not exist in the inspected live database and are not part of the ten-function handoff. The new inventory screen does not present buttons for those nonexistent APIs. Existing compatibility guards that prevent local/JSON stock mutation remain. Separate normalized job allocation/return posting and reconciliation of legacy PO documents still require their own backend integration; this change does not turn manual stock movement into a job collection, inspected return, damaged-stock operation or staged transfer. Do not apply the superseded proposal to enable those workflows without a separate compatibility review.

## Validation and release

Automated coverage includes strict RPC arguments and response mapping, summary arithmetic, nullable price inheritance, archive/restore, default location/hierarchy forms, exact barcode lookup and collision choice, partial save retry, duplicate submission, lost-response stock replay across remounts, two browser clients, image upload/link failures, signed URL renewal, camera input, permission denial, empty inventory, focus/reconnect and PO receipt separation. The full browser regression suite also covers the existing CRM/account/approval workflows.

The SQL suites under `tests/*-sql.test.mjs` execute only in disposable PGlite databases. Inventory SQL regression cases there exercise the historical proposal, not a replay or live validation of the handoff's already applied SQL. The new handoff integration is covered by adapter/model tests and browser contract fixtures. No real-session production write, binary Storage HTTP upload or physical device test has been performed here.

Release steps:

1. Deploy the frontend through the existing Next.js hosting pipeline. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the existing project. No inventory SQL deployment is required.
2. Sign in with an authorized real management account and verify `/crm/inventory`: empty state or current catalogue, product/default variant creation, edit/reload, warehouse/default location creation, location hierarchy and permissions.
3. With controlled acceptance stock, verify Add Stock, deduction and immediate transfer, active-reservation rejection, duplicate/retry behavior and a second signed-in client. Use the existing PO receipt flow for actual purchases.
4. Verify actual JPEG/PNG/WebP/AVIF upload, private signed image display/renewal, gallery metadata and archive/replacement. Verify camera permissions and a physical keyboard scanner on the deployed HTTPS origin.

The frontend has not been published by this task, and the deployed page has not been claimed as verified. Automated browser tests intercept Supabase requests; the deployed authenticated acceptance checks above remain necessary.

## Files changed

| File                                     | Change                                                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/crm/inventory-backend.js`  | Exact deployed RPCs, warehouse-only reads, existing catalogue choices/PO reads, private Storage upload/signing and response/error checks.                |
| `src/features/crm/inventory-model.js`    | Snapshot decoding, active image scopes/order, per-location low-stock rules, damaged quantity, 10 MiB/AVIF validation and movement argument construction. |
| `src/features/crm/inventory-controls.js` | Inventory/warehouse forms, gallery, barcode lookup/choice, stock confirmation/recovery, PO receipt form, permission checks and refresh lifecycle.        |
| `src/features/crm/CRMWorkspace.tsx`      | Pass access context when initially loading inventory or warehouses.                                                                                      |
| `src/features/crm/runtime.js`            | Safely project v1 recent movements and optional choices; retain the original CRM PO/supplier document creation path.                                     |
| `tests/inventory.test.mjs`               | Model and exact adapter contract checks.                                                                                                                 |
| `tests/browser/inventory.spec.ts`        | Deployed v1 contract fixture and browser acceptance/regression cases.                                                                                    |
| `tests/fixtures/hosted-inventory.js`     | Authenticated workspace fixture with Storage, table reads and module grant overrides.                                                                    |
| `README.md`                              | Point to the deployed contract and revised release guidance.                                                                                             |
| `docs/WAREHOUSE-INVENTORY.md`            | Deployment history reconciliation, implementation details, limitations and release steps.                                                                |
