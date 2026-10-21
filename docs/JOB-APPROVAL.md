# Completed-job approval

Operational status stays `Completed`. Approval is stored separately and shown as `Pending Approval` or `Approved` in job cards, details and job reports. Use the Jobs filter **Pending Approval**, open a job and select **Review completed work**. Review tasks, earlier photos, installation media/device coordinates and returns, then approve with optional notes.

The signed-in Supabase client calls `job_approval_snapshot`, `approve_completed_job(p_job_id, p_revision, p_notes)` and `read_job_approval_notification(p_id)`. Approval requires an active backend session, an Admin/Manager/Super Admin role, and `jobs.view` plus `jobs.approve`. Installers cannot approve even if mistakenly granted `jobs.approve`. The current deployed resolver already grants approval to Admin and Manager by default; this migration does not change grants or accounts.

The approval RPC locks the job and its review state, checks the reviewed revision, requires Completed status, all linked tasks Completed, returns Processed/Cancelled, and installation evidence with device coordinates and an existing private `crm-media` object. Each revision can have one approval. Repeated confirmed submissions return that approval without duplicating history or notifications. Notes, reviewer identity/name and approval time are saved in PostgreSQL. A lost response is reconciled with a read; the UI never automatically retries approval.

`job_approval_state` is the authoritative current revision and approval pointer. `job_approval_history` preserves each review, its saved work snapshot and any later invalidation reason/time/actor. Direct client writes to these tables are denied. Client-supplied approval fields in job JSON are stripped by a database trigger. Existing completed jobs initialize as pending; none are approved automatically.

Database triggers invalidate approval when a job is reopened or its installer, scope, products, address, notes, photos, installation evidence or collection/evidence requirements change. Linked task/return creation, editing, reassignment or removal also advances the revision. Replacing/removing a referenced Storage object invalidates approval even if the JSON is unchanged. Timeline-only and financial updates preserve approval. A stale review cannot approve the next revision. Reviewed job records cannot be hard-deleted through `crm_records`, preserving their review linkage/history.

Warehouse returns linked through `inventory_job_allocations` are also included in the review snapshot, completion checks and invalidation triggers. They require completed warehouse inspection or cancellation. These checks become active when the warehouse extension is present, regardless of which extension is applied first. Ordinary evidence reads/access timestamps do not revoke approval; replaced versions, deletion markers and archival do.

Persistent `job_approval_notifications` have a unique recipient/job/revision/event key. Completion and revised completed work notify active authorized Admin/Manager reviewers and the designated Super Admin; approval notifies the assigned installer. Recipient resolution honors personal/role grants, module locks and blocked/banned accounts. Notifications and reviews have RLS. The inbox refreshes through Postgres Changes and on focus, reconnect, visibility and a 30-second interval. Read state is saved. Backend authorization is repeated on every mutation, independently of any stale UI. Permission refresh uses the existing `get_access_context` controller. New review revisions also clear the browser's media cache.

Approval never updates invoices, payments, stock or operational status. Existing completion/billing workflows continue independently.

## Database and deployment

The active repository stores jobs, tasks and returns in `public.crm_records`; the inspected normalized `job_orders` table is not its business data source. This extension deliberately uses those existing text job IDs and does not fabricate normalized jobs or rewrite IDs. It is independent of the prepared warehouse migration.

Prepared migration: `supabase/migrations/20261021093841_completed_job_approval.sql`. Apply this **new migration only** through the normal database release process; do not rerun the repository's old migrations. Deploy the frontend build after the database extension. If the extension is unavailable, the review screen displays the actual RPC error and approval stays disabled.

This change is prepared locally. The new migration has not been applied to the connected production project, and the frontend has not been deployed to Vercel. Existing production account credentials and data have not been reset.

## Files changed for Step 10

- Added `src/features/crm/job-approval-backend.js` and `job-approval-controls.js` for authenticated API calls, review UI, permission checks, refreshes and inbox alerts.
- Updated `src/features/crm/auth-backend.ts`, `runtime.js`, `views/operations.js` and `views/shell.js` for integration, badges/filters, reviewer details, reports and notification actions. Fixed an idle cloud-flush promise that prevented subsequent refreshes.
- Added `supabase/migrations/20261021093841_completed_job_approval.sql` for review state/history, RLS, approval/read RPCs, mutation/Storage/warehouse-return triggers and Realtime publication.
- Added `tests/job-approval.test.mjs`, `tests/job-approval-sql.test.mjs`, `tests/browser/job-approval.spec.ts`, `tests/fixtures/job-approval-baseline.sql` and `tests/fixtures/hosted-job-approval.js`.
- Updated `README.md` and added this release/verification guide. Earlier account-management and inventory changes are preserved.

## Verification

- `npm test` runs the adapter/model tests and PostgreSQL tests using PGlite. The new SQL tests execute the actual migration, RPCs, triggers, grants and RLS. They cover existing/new pending jobs, all reviewer roles, installer/denied/revoked-session rejection, incomplete work, notes/history persistence, deduplication, stale revisions, JSON/table tampering and work/media invalidation. Auth/session functions in the fixture are explicit local substitutes for the existing deployed resolver.
- `npm run test:e2e` runs actual runtime/view code against isolated authenticated API fixtures. Approval tests cover filters/badges, evidence/coordinates/returns, notes, refresh/another installer client, notification read state, reports, denied roles, revocation, backend errors and re-review after invalidation.
- `npm run typecheck` and `npm run build` verify the Next.js application.

Before declaring production verified: apply the targeted migration and deploy the frontend, then test real Admin/Manager/Super Admin and installer sessions, denied/revoked sessions, actual uploaded media, Realtime delivery between devices and concurrent review/material-change transactions against the hosted database. The local browser fixtures do not establish live Realtime delivery, and PGlite does not replace a multi-connection concurrency test.
