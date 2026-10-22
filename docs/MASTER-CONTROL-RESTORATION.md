# Master Control restoration — 22 October 2026

The existing Master Control is restored in source. The frontend has **not** been deployed, and the new access extension has **not** been applied to Supabase. The live CRM is not yet verified as repaired. No real accounts, passwords, grants, stock or business records were changed by this work.

## Regression recovered from Git history

The comparison is `d18b60f` (before the account-management change) against `114a4c6` (current committed base). The older implementation remains recoverable in Git.

- An early return in `views/access.js` replaced Master Control's Overview, Ultimate Control, Access controls, Accounts and Security tabs with a five-permission account panel.
- Hosted Users rendering bypassed the earlier creation and Login as controls. A hosted-action gate also rejected the older creation/impersonation handlers.
- Older permission controls, role-wide actions, per-profile actions, module/function editors, locks and owner security were still present below the early return, but inaccessible.
- Historical Login as changed local browser state. The deployed `start_impersonation`/`end_impersonation` functions and `impersonation_sessions` recorded audited sessions, but inspected authorization and assignment policies continued using the original `auth.uid()`. Reconnecting that button alone would have retained owner database access.

The five-tab layout, overview, navigation and existing account design remain. Hosted sections now connect to authoritative services. The demo implementation remains available only in its existing development/test mode.

## Restored behavior and backend reuse

Access controls use the inspected `system_modules`/`permissions` registry, including all 15 registered modules and their actual action names. Inventory, Warehouse, Jobs, Tasks, Leads, Quotations, Billing, Reports and Internal Chat remain included. Modules and Functions retain separate editor tabs. Global, role and profile selectors support ordinary grants, module states (enabled, disabled, read-only, locked, default), independent tab visibility, and explicit action overrides. Bulk role/profile access and individual role changes remain in Ultimate Control. There is one active permission editor, rather than a second account-only replacement.

The editor previews an actual profile's effective access, the responsible decision source and explicit rule ID. A role preview selects an active member when no profile is specified and labels that account; this includes their individual rules, rather than pretending all members necessarily resolve identically. Without an active member, select a profile to obtain a preview.

Existing authenticated services are reused:

| Operation                                       | Service                                                                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Effective permissions                           | `get_access_context({p_platform:'web'})`                                                                         |
| Ordinary module states                          | `admin_set_module_access`                                                                                        |
| Ordinary role/profile action delegation         | `admin_set_role_permission`, `admin_set_user_permission`                                                         |
| Edit name/phone                                 | Authenticated `profiles` update, returned row required                                                           |
| Change role/status, block and eligible deletion | `admin_update_user_access`, `admin_set_user_blocked`, `admin_delete_user`                                        |
| Invite a new ordinary staff account             | Existing `create-user` Edge Function                                                                             |
| Change another ordinary user's password         | Existing `owner-change-password` Edge Function                                                                   |
| Change own password                             | `auth.updateUser({password})`; the owner Security form also preserves its existing current-password verification |
| Login as / exit                                 | Existing `start_impersonation`, `end_impersonation`, and session/audit tables                                    |

The account adapter rechecks the current action flag before each mutation. Backend RPCs/RLS recheck independently. Inputs whitelist editable profile fields, destructive actions retain confirmation and linked-history safeguards, and duplicate submissions are blocked. Passwords are cleared from form fields, never saved to CRM state or URLs, and the administrative path validates 12–1024 characters. `password_changed:true` and invitation partial-completion responses close the dialog and instruct review; neither retries automatically.

Shared `/login`, normal CRM routes, protected Master Control and `/owner` compatibility routes remain. Login follows `access_blocked` so a global lock does not reject an applicable explicit grant or owner recovery. Successful new sign-ins and email callbacks clear old impersonation selectors; a new Auth session cannot reuse the prior session-bound selection. Profile has an authenticated self-password action independent of administrative delegation.

## Focused pending database extension

File: `supabase/migrations/20261022070731_restore_master_control_overrides.sql`. It was created with the Supabase CLI and tested in disposable PGlite. It is not an inventory schema migration.

The extension preserves the inspected signatures, ordinary permission records, account protections and inventory RPCs. It introduces `master_access_rules`, owner-only editing RPCs and an owner snapshot. These separate ordinary saved permissions from deliberate Super Admin bypasses.

Precedence is: designated owner recovery, explicit profile override, explicit role override, then ordinary restrictions/grants. Equal-scope denial wins; a same/higher-scope explicit view denial blocks dependent actions. An explicit action allow supplies its view prerequisite, and no other action. Removing a rule restores the underlying restrictions. Ordinary account role denials continue to constrain ordinary profile allows. Installer account administration, owner protection and data-integrity safeguards remain enforced even with explicit overrides.

New public functions are `admin_get_master_control`, `admin_set_access_rule`, `admin_set_system_lock` and `admin_bulk_access`. Existing `get_access_context` and `start_impersonation` are extended compatibly. The underlying role permission helper adds `default` removal. `private.has_module_access`, `current_role_key`, `resolve_module_state` and the service-only password finalizer adopt the shared decision resolver. Additional private helpers provide decisions, preview, effective identity and audit handling.

The migration adds an Auth-session binding to existing impersonation records and changes inspected identity-dependent functions/policies to use the effective identity. Definition hashes stop deployment when those inspected function bodies have changed, so a newer backend is not overwritten silently. Existing assignment checks are retained and require current module permission. Generic `crm_records` RLS now applies module actions and installer assignment/member boundaries; operational log/notification behavior remains usable. Operational impersonated writes record the real actor, effective actor and impersonation record in `privileged_security_events`. Sensitive record contents are not copied into that audit metadata.

The generic cloud writer now distinguishes INSERT from UPDATE, verifies returned rows and ignores normalization-only defaults. This lets an update-only grant work without requiring create permission and prevents staff saves from attempting to create owner settings. Normalized inventory is still excluded from JSON synchronization.

No RLS was disabled, no service key was introduced in the frontend, and no grant defaults or business records are reset. The existing service-only password finalizer remains inaccessible to authenticated/anonymous clients.

## Impersonation lifecycle and boundaries

The real Supabase Auth session remains the original actor. A cookie contains only the selected audited session UUID. Browser and server PostgREST clients forward it as `x-crm-impersonation`. The private resolver requires the designated active owner, AAL2, the matching Auth session, a live unexpired impersonation record and an active ordinary target. Invalid, revoked, wrong-session, blocked-target and expired selections fail closed.

The banner identifies the target. Database policies, route guards, controls and business ownership use the effective identity; security events retain the original actor. Exit calls the existing RPC using the native actor and clears the selector. A same-origin server recovery route can end/discard an invalid selection after independently verifying the owner. Security also lists active sessions so a lost start response can be recovered without creating another session. Existing reason, ticket, MFA, TTL and audit semantics are retained. The owner can enroll/verify a TOTP authenticator from Security; no MFA changes occurred during testing.

Permission refresh uses existing permitted Realtime events, focus, reconnect, visibility restoration, protected operations and polling. Grants changing clears stale protected collections/dialogs and refetches permitted data. Identity changes stop/drain pending cloud writes and reload other tabs through BroadcastChannel.

**Remaining service boundary:** Supabase Storage, Edge Functions and Auth administrative operations do not share the PostgREST effective-identity header. During impersonation those operations are deliberately blocked in the app, with an instruction to exit first. Realtime subscriptions also remain disabled during impersonation because they authenticate the original JWT; focus/reconnect/polling still refresh target data. Private file uploads/downloads, invitations and password changes therefore require exiting impersonation. Extending these services to act safely as the target needs a separate audited server integration; the app does not silently send owner authority from the target workspace.

Existing non-impersonated private inventory images, stock moves and account administration remain connected. Registered Complaints has controls in the registry, but no recovered CRM screen/route; this change does not fabricate one. Previously documented normalized allocation/return and job-approval deployment gaps remain separate; see their module documents.

## Files

| Area                            | Changed source                                                                                                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restored screens and actions    | `views/access.js`, `views/shell.js`, `views/operations.js`, `runtime.js`, `master-controls.js`, `account-controls.js`                                                                                                       |
| Authenticated adapters          | `master-backend.js`, `accounts-backend.js`, `auth-backend.ts`                                                                                                                                                               |
| Effective identity and recovery | `impersonation.js`, `ImpersonationRecovery.tsx`, `src/app/api/impersonation/exit/route.ts`, catch-all page, access/session and Supabase browser/server clients, `CRMWorkspace.tsx`, shared `AuthPage.tsx` and Auth callback |
| Generic CRM persistence         | `cloud-records.js`, `cloud-store.ts`                                                                                                                                                                                        |
| Deployment artifacts            | Focused migration above; `supabase/functions/create-user/{index.ts,handler.mjs}`; `tsconfig.json` excludes the Deno entry point from the Next.js compiler                                                                   |
| Tests                           | `master-sql.test.mjs`, `master.test.mjs`, `cloud-records.test.mjs`, account tests/browser fixture and inspected catalog fixtures                                                                                            |

## Validation and release

Local verification uses disposable database records and browser HTTP/service fixtures. It sends no real invitations, changes no real passwords and writes no live CRM data. SQL tests exercise the migration with normal function-body checking, precedence, direct RLS requests, assignment filtering, audit actors, session expiry/AAL/session-binding denial, owner protection, grant removal and the service-only finalizer. Adapter tests cover exact RPC parameters, stale revocation, self-password handling, partial completion and invitation failures. Browser tests cover the restored tabs, account controls, impersonation/exit, scoped permissions, existing CRM flows, inventory and job approval. `npm test` passes 70 tests, including 11 disposable database tests of this extension. `npm run test:e2e` passes all 41 browser tests, including the locked-workspace shared-login regression. `npm run typecheck`, `npm run build` and `git diff --check` pass.

The Supabase security advisor was inspected read-only. Its pre-existing project findings are not a verification of this unapplied migration and were not broadly rewritten as part of this restoration. Run advisors on the migration test environment and again after release, including checks on new functions' execute grants and the new table's RLS.

Deployment order:

1. Review and promote **only** the focused Master Control migration through the project's authorized database release process, first in an isolated environment matching the inspected deployed baseline. Reconcile local migration history before release. Do not use an unfiltered `supabase db push`: the older inventory proposal conflicts with the already applied v1 backend. Do not rerun the handoff inventory SQL, recreate accounts or reset passwords.
2. Deploy the targeted `create-user` compatibility update through the existing Edge Function workflow with JWT verification preserved. It keeps invitations and protected-role checks, but uses the current `users.can_create` flag so a permitted Manager can create staff and a revoked grant cannot. Its handler is tested separately from the Next compiler. The deployed `owner-change-password` source is reused; no redeploy of that endpoint is required. The pending finalizer update resolves its new permission precedence.
3. Deploy the frontend to the existing Next.js/Vercel project using its existing public Supabase configuration. No Vercel project binding or authorized release pipeline was available in this workspace, so no production publish was attempted. If the frontend precedes the migration, it displays deployment-pending state and prevents audit-only impersonation/new overrides; this is not full functionality.
4. On the production HTTPS origin, verify shared login, owner recovery, all restored tabs, effective previews, focused role/profile grants and removals, direct URL/API denial and an already-open second session. Use explicitly disposable profiles and controlled inventory for writes. Verify the existing invitation callback/email delivery and actual administrative password endpoint/session cleanup with disposable accounts; the live password endpoint permits the production origin, so local fixtures do not prove its production CORS path.
5. Verify AAL2 impersonation of a disposable account, assignment filtering, expiry/revocation, original/effective audit actors, exit/recovery and a second open tab. Confirm the documented private-service boundary. Perform inventory Storage/scanner/camera acceptance described in `WAREHOUSE-INVENTORY.md`.

Until these releases and authenticated acceptance checks are complete, the live CRM repair remains pending.
