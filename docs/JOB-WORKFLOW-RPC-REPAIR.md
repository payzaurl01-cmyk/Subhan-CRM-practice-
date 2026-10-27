# Job workflow RPC repair — 27 October 2026

Database repair is deployed to `moevynyglfeebzegttfl`. The signed-in deployed **Create Job button has not been verified**, and the frontend changes are local only. No Vercel token or linked deployment credentials were available. Do not describe the complete live flow as verified.

## Cause and scope

The frontend already called `crm_job_workflow_command`, but the function was absent from the live database and its migration history. The older local `conditional_job_workflow` migration depended on an undeployed effective-identity extension and included normalized-table changes outside this repair. It was not applied.

This repair adds the missing RPC against the existing `crm_records` model, using its text IDs and JSON relationships. Existing tables, functions, RLS policies, website lead intake, layouts, account controls, approval and inventory APIs are preserved. No business records were migrated or bulk corrected. Live CRM records remained at 123; `job_orders` remained empty after rollback verification.

The existing lead conversion requires exactly one accepted quotation. Its cloud path now uses the same RPC as the quotation button. No quotation-free lead conversion existed to preserve, and none was introduced. The already-existing `create` operation remains supported without adding a screen.

## Changed files

- `supabase/migrations/20261027075508_restore_crm_job_workflow_rpc.sql`: focused RPC and supporting private objects.
- `supabase/migrations/20261027075711_harden_crm_job_workflow_receipts.sql`: explicit anonymous-session receipt policy denial and existing audit-log JSON contract.
- `src/features/crm/job-workflow-backend.js`: preserve backend error code, details and hint.
- `src/features/crm/job-workflow-controls.js`: retain revision as well as operation ID across retries; preserve reopening target.
- `src/features/crm/runtime.js`: route cloud lead conversion through the RPC; update linked quote/lead state after confirmed success.
- `tests/job-workflow-rpc.test.mjs`: isolated SQL integration tests.
- `tests/job-workflow.test.mjs`: lost-response/realtime-refresh retry regression.
- This report.

## Database objects and contract

Added `public.crm_job_workflow_command(p_job_id text, p_revision bigint, p_operation text, p_payload jsonb, p_operation_id uuid) returns jsonb`. All five arguments are required and have no defaults. IDs, operation, payload, revision and a nonempty payload reason are validated; revision must be nonnegative and must be zero for creation. Existing job revisions default to zero when absent.

The RPC and new helper functions use invoker privileges and an empty search path. Execute is revoked from `PUBLIC` and `anon`, and granted to `authenticated`. Existing `private.current_role_key()` and `private.has_module_access()` enforce active sessions/accounts, management role, module controls and current individual/role permissions. Related quote/lead and changed/new task writes receive their own permission checks. Existing RLS remains in force.

Added `private.crm_job_workflow_operations`, its primary key and job/time index, and an actor-scoped RLS policy. This is private retry receipt storage, not business-record storage. Anonymous sign-ins are explicitly denied. Added private helpers: `crm_work_type`, `crm_company_stock`, `crm_qty`, `crm_stock_facts`, `crm_stage_type`, `crm_workflow_shortage`, `crm_workflow_plan`, `crm_workflow_release`. No triggers were added. An initial broader revision-trigger proposal was rejected by automatic review; the narrower migration was accepted and deployed.

| Operation | Allowed payload fields (in addition to required `reason`) |
| --- | --- |
| `from_quote` | `quoteId`, `installerId`, `installationDate` |
| `create` | `customer`, `phone`, `address`, `postcode`, `workType`, `installerId`, `installationDate` |
| `product` | `id`, `lineId`, `productId`, `name`, `sku`, `quantityRequired`, `unitGross`, `cancelled`, `priceConfirmed`, `fulfilmentSource`, `dependentTaskIds` |
| `stage` | `id`, `stageId`, `name`, `description`, `type`, `after`, `applicable`, `taskTitle`, `assignedTo`, `requiredEvidence`, `requiresStock` |
| `reconcile` | No additional fields |
| `reopen` | `target` |

Success returns exactly `{ "job": { ... }, "tasks": [ ... ] }`. Errors remain native PostgREST errors with the actual backend message; revision conflicts use SQLSTATE `40001`, access denials use `42501`, and invalid/unknown operation fields use `22023` where applicable. Unknown operations are rejected explicitly. No direct-write fallback was introduced.

Operation IDs are UUID retry keys; job/quote/lead/task IDs remain text. The request fingerprint includes job ID, revision, operation and canonical JSON payload. Reuse with different inputs is rejected. Operation/job advisory locks, quotation row locks, parent-job row locks and dependent-task locks serialize workflow writes. A quotation can have one job, matching existing conversion behavior; separate accepted quotations on the same lead remain allowed. Job numbers are allocated under a transaction lock. A retry returns the current confirmed job/task snapshot without repeating writes. All writes and receipts roll back together on failure.

Revision checks protect workflow commands against other workflow commands. Ordinary existing form saves retain their current behavior; the RPC reads the locked current JSON and merges only its operation fields. No global write guard was added.

## Collections and integrations

Writes use `crm_records` collections `jobs`, `tasks`, `quotes`, `leads`, `pickLists`, `logs`. `returns` and `stockMovements` are consulted for workflow safeguards. No jobs are inserted in `job_orders`; notifications, evidence, approval and billing APIs are not replaced.

Creation reads the accepted quote and linked lead on the server. It preserves total value, billing-basis unit-price/tax snapshots, references, site details, installer/work assignments and evidence tasks. Custom/service/customer-supplied/cancelled/nontracked-product lines do not generate stock stages. Inventory jobs retain shortage/picking/collection stages and their existing pick-list records. Creation does not reserve or deduct stock; allocation remains in its existing inventory process. Product reductions release only already-existing verified legacy reservations through existing RLS, never on-hand stock or issue history. Unmapped or issued stock requires the existing return/reconciliation process. Completed history, manual stages and task dependencies are retained.

## Verification

- All 100 unit/SQL tests, including the new RPC integration and retry tests, passed.
- Type checking and the production Next.js build passed.
- 14 of 15 selected browser tests passed, including all workflow and approval cases. The mobile navigation test found the Jobs tab but timed out because the Next.js development overlay intercepted its pointer events; navigation was not changed by this repair.
- Before and after installation, rollback tests on the live database created service and inventory fixtures, checked links/tasks, billing snapshots, retry behavior, stale revisions and absence of normalized jobs, then rolled everything back. Existing record counts were unchanged.
- The live REST endpoint now resolves the function and returns `401 / 42501` for an unauthenticated call, replacing the missing-function lookup failure.
- Supabase security advisors reported no findings referencing the new RPC/receipt objects after hardening. Existing unrelated findings were left outside scope.
- `git diff --check` passed.
- Locks are implemented and sequential/retry conflicts are tested. Simultaneous independent production-session creation was not exercised. Signed-in deployed browser creation remains unverified.

## Deployment and remaining steps

Both SQL migrations are recorded in the specified project's migration history, and each notified PostgREST to reload its schema cache. Do not push the older pending local migrations.

Publish the local frontend changes through the existing Vercel project's authorized deployment workflow, preserving its current Supabase public environment variables. Then sign in to the deployed CRM and verify the existing Create Job button with isolated accepted service-only and inventory quotations; confirm visible jobs, correct stages, retry/double-click behavior and a second session's stale-revision handling. The SQL repair is installed; frontend publication and this authenticated end-to-end verification remain outstanding.
