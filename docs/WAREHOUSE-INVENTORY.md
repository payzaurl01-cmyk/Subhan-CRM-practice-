# Warehouse inventory implementation

The hosted CRM now reads the existing normalized Supabase product/variant, warehouse/location, balance, reservation, purchasing receipt and movement tables. Browser storage is not the hosted inventory ledger. The offline development demo remains isolated behind its existing non-production test flag.

## Inspected backend

Read-only inspection of `moevynyglfeebzegttfl` found the normalized tables and `crm_receive_po` already deployed, but no normalized products, variants, warehouses, balances or job orders. Two current CRM jobs were in `crm_records`. No production records, stock, accounts or passwords were changed during implementation.

The targeted extension is `supabase/migrations/20261021084740_warehouse_inventory.sql`, generated with the Supabase CLI. It assumes the inspected deployed foundation, including `private.crm_upgrade_require`, command receipts/auditing, `private.has_module_access`, and the normalized inventory schema. It is **not** a replacement foundation or a migration that should be applied blindly with the older seed/account scripts.

## Operator workflow

1. Create a warehouse with a unique code, address, postcode, optional coordinates and active status. A default bin is created. Add Zone/Aisle/Rack/Shelf/Bin locations with same-warehouse parents as needed. Deactivate referenced locations instead of deleting them.
2. Create a shared catalogue product with optional category (or a new category), brand/supplier, unit, prices, images and opening stock at an explicitly chosen location. Its first sellable variant is created in the same transaction. Empty attributes produce a default variant.
3. Add/edit variants using one `Attribute: Value` pair per line. Combinations, SKUs and barcodes are unique; adding a variant never creates stock. Edit barcode aliases through the variant form. Replacing a primary barcode retains the old alias. Catalogue edits do not rewrite historical quotation, invoice or movement snapshots.
4. Use Add Stock for non-PO receipts, Adjust Stock with a signed delta and reason, or Transfer with an explicit destination. Both stock and reservation quantities are maintained per variant/bin. Available is on hand minus reserved. Every posted stock operation requires a reason/reference and is journaled with the actor and database timestamp.
5. For PO deliveries, create a normalized PO/supplier in Purchasing and receive its outstanding lines through the existing `crm_receive_po` transaction. It posts the receipt once, checks remaining ordered quantities and creates linked journal rows. Manual Add Stock rejects payloads carrying PO/receipt IDs or PO-linked flags. Manual delivery references must be unique per variant/bin, preventing an operator from posting the same manual delivery again with a new submission key. The existing PO receipt contract accepts positive integer quantities.
6. For current CRM jobs, open Inventory → Jobs (also shown in Picking). A manager confirms the job item, original snapshot, variant mapping, location and authorized collector. This creates an `inventory_job_allocations` approval and reserves real stock. Existing job and item IDs are preserved; no normalized job/contact/quotation is fabricated. Each current CRM job item is approved from one bin; transfer stock first if consolidation is needed.
7. The authorized collector scans or enters the exact allocated SKU/barcode and confirms the quantity. The backend checks the allocation, assignment, remaining reservation, job state and financial hold. Repeated issues cannot exceed the approval. Confirming full collection checks every item, updates the current job and completes its pickup evidence without deducting stock a second time.
8. Request returns from issued job allocations. Match pickup, have authorized warehouse staff confirm delivery, then inspect usable and damaged quantities. Only usable units become available; damaged quantities remain separate. Financial credits/invoices are not issued or rewritten by physical stock restoration.

The existing legacy job/return paperwork remains visible. Old generic stock journals and unassigned balances appear under Review and are not silently imported or assigned. Old generic purchasing documents remain readable, but must be reconciled explicitly; all new hosted POs use the normalized receipt path. Compatibility functions cannot post stock into generic JSON records.

## Images and scanning

`inventory-images` is private, with JPEG/PNG/WebP and a 5 MB per-file limit enforced in the client and bucket. Up to eight references are stored per product/variant; the first is the main image. Variant images fall back to catalogue images. Upload progress shows file-by-file completion and actual errors. Unique object paths avoid overwriting existing images. Upload failure leaves the prior references intact; unused failed-workflow uploads can be cleaned up separately after checking references.

Camera scanning uses `BarcodeDetector` and `getUserMedia` where supported. It stops after one detected code, cancels late reads/streams, and creates a preview. Manual input and keyboard scanners remain available when camera permission is denied or scanning is unsupported. Unknown codes offer an explicit authorized product/variant form with the code prefilled; scanning never creates a product or stock automatically. Keyboard Enter can confirm an allocated issue/return pickup after its operation/quantity fields are reviewed.

## Persistence and authorization

The public `inventory_command` RPC is an invoker wrapper around private authorized transactions. Commands re-use the deployed request hash/idempotency receipt system. Identity comes from the signed-in session; no service-role credentials are sent to the browser. Catalogue/warehouse administration requires management roles plus the relevant `inventory` or `warehouse` action grant. Installers are limited to granted viewing and their assigned collection/return operations.

Direct client writes to normalized stock/catalogue tables are revoked. Read policies use backend module permissions; allocation reads also check the collector. RLS protects the private image bucket. Balance checks, row locks and the same advisory lock namespace as existing PO receipts protect stock. Transfer locks are sorted. A deferred reservation floor prevents another command from freeing approved reservations accidentally. Mutations are confirmed only after an actual backend result; identical explicit retries retain the same idempotency key.

`cloud-store.ts` excludes inventory projections from JSON writes and preserves existing legacy rows. The extension also makes the old JSON inventory collections read-only. Refreshes occur after confirmed changes, on focus/reconnect, every 30 seconds, and through permitted Realtime events. The migration adds inventory tables to the existing Realtime publication if it exists. Movement details load older history in pages of 100 rather than losing history outside the initial snapshot.

## Files changed for this task

| Files                                                                                         | Purpose                                                                           |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/features/crm/inventory-backend.js`                                                       | Authenticated RPC, receipts, Storage, history and Realtime adapter                |
| `src/features/crm/inventory-controls.js`                                                      | Hosted inventory, warehouse, product/variant, scan, allocation and return screens |
| `src/features/crm/inventory-model.js`                                                         | Filtering, balance totals, attributes, exact lookup and image validation          |
| `src/features/crm/inventory-scanner.js`                                                       | Camera lifecycle, one-read previews and fallback errors                           |
| `src/features/crm/CRMWorkspace.tsx`, `auth-backend.ts`, `runtime.js`, `views/warehouse.js`    | Mounting, catalogue projections and existing workflow integration                 |
| `src/features/crm/cloud-store.ts`                                                             | Preserve legacy records and stop generic stock writes                             |
| `supabase/migrations/20261021084740_warehouse_inventory.sql`                                  | Targeted extension, transactions, constraints, permissions, images and job bridge |
| `tests/inventory-sql.test.mjs`, `tests/inventory.test.mjs`, `tests/browser/inventory.spec.ts` | Database, adapter/scanner/model and browser verification                          |
| `tests/fixtures/inventory-baseline.sql`, `tests/fixtures/hosted-inventory.js`                 | Data-free schema snapshot and isolated browser services                           |
| `package.json`, `package-lock.json`                                                           | Pinned development-only PGlite PostgreSQL engine for SQL tests                    |
| `.gitignore`, `README.md`, this document                                                      | CLI cache exclusion and release notes                                             |

Existing uncommitted branding/account-management changes have been preserved.

## Verification and release status

`npm test` exercises the migration against a local PostgreSQL engine using the inspected schema fixture. Tests cover preserved IDs/totals and unassigned balances, separate warehouses, catalogue changes/snapshots, duplicate combinations/identifiers, hierarchy/deletion guards, explicit job approvals, assigned issues, returns, reservations, insufficient stock, rollback after both transfer updates, idempotency, reused purchasing receipts, authenticated RPC grants and direct-write/permission denials. Permission helpers are controlled fixtures; production JWT/Auth/RLS integration still needs release verification.

Browser checks cover the actual runtime against isolated services: warehouse filters, exact manual/keyboard scans, unknown barcodes, camera duplicate suppression, catalogue forms, failed image replacement, duplicate submissions, permission errors, mobile layout, existing-job allocation/scanned issue, and another browser page reading the updated service state. They do not claim a live cross-device Supabase test.

PGlite serializes queries on one connection. Competing withdrawal requests and rollback behavior are tested, but true multi-connection contention/deadlock stress remains a staging acceptance check. Real phone/desktop camera testing, USB/Bluetooth scanner testing, successful uploads/downloads against the private Supabase bucket, and refresh from two physical authorized devices also remain acceptance checks.

Local results on 2026-10-21: **35 unit/database tests passed, 23 browser tests passed, `npm run typecheck` passed, and `npm run build` passed**. Formatting and `git diff --check` also pass.

This extension migration is **prepared, not applied to production**. No frontend deployment has been made in this session. Vercel is not connected. Review/apply only this extension to the existing foundation through the normal deployment workflow, deploy the frontend to the existing Vercel project, then verify the authenticated operations and hardware/device acceptance cases. The live CRM is not updated by these local changes.
