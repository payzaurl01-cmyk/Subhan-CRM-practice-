# One-click impersonation and log visibility — 27 October 2026

**Implemented locally; deployment requires approval.** Automatic approval review rejected the production migration because it changes security-sensitive identity/permission functions, RLS policies, and audit triggers across existing tables. No part of this migration was applied. The deployed CRM is not claimed to have these changes. Vercel deployment credentials were unavailable in this workspace.

## Requested behavior

The existing Login as user button now starts immediately, prevents duplicate submissions, and shows a brief loading state. The reason, ticket, authenticator-code and confirmation form are removed from this action. Backend confirmation precedes changing the session selector. Failed starts leave the original identity intact and display the backend error.

The exact system-generated reason is `Super Admin initiated Login as user.`; the server marks its audit reason source as `system`. Normal login, configured account MFA, authenticator setup and unrelated authentication protections are unchanged. Only the separate impersonation AAL2 step-up requirement is removed; no assurance claim or target credential is manufactured.

The verified target name/email appear above the entire workspace as `You are logged in as: [Name] — [Email]`, with `Return to Super Admin`. Scoped layout rules keep the banner visible without overlapping desktop/mobile content. Return uses the original backend login, ends the audited session, clears the selector, reloads permissions/data, and restores the originating Users or Master Controls page. Invalid or expired selectors recover through the existing exit API. The default landing page redirects to a permitted page when the target cannot view Dashboard.

## Why the backend changes are required

The deployed start RPC only records an impersonation event. Its frontend enforcement extension is pending; simply removing the modal would not apply target authorization. The broader pending Master Controls migration is **not** included in this repair.

The proposed migration completes the existing header/session mechanism. `private.effective_user_id()` returns the unchanged `auth.uid()` outside impersonation. Within impersonation it verifies the original active, verified Super Admin, the original Auth login session, active/unbanned target eligibility, non-Super-Admin target, expiry and session ownership. Existing permission and assignment checks then use the target identity. Self/nested/concurrent switching is rejected; retrying the same target/login reuses its session. Targets' ordinary Auth sessions, passwords, roles and grants are untouched.

The private cleanup helper can end only a session owned by the actual actor. Bound-session cleanup remains possible after authority revocation; a currently authorized Super Admin can also clear their own stranded older login sessions. Authentication/security operations retain the exit requirement. The existing browser transport continues to block scoped Storage/Auth mutations and disables owner-token realtime channels during impersonation; existing access polling and reload recovery remain active.

## Log rules

Backend RLS uses the viewer's effective trusted role and existing `settings`/logs module permissions. It applies to mixed collection queries, row details, searches, counts, pagination and data returned for exports. Ordinary realtime deliveries are subject to the same SELECT policies; impersonated clients continue using scoped polling rather than owner-token realtime.

| Viewer | Maximum actor roles |
| --- | --- |
| Super Admin | Super Admin, Admin, Manager, Installer; unknown historical roles |
| Admin | Admin, Manager, Installer |
| Manager | Manager, Installer |
| Installer | Existing table/module grants; no additional grant |

New events receive server-generated actor-role snapshots in existing JSON/metadata. Client-supplied actor IDs/roles cannot relabel them. Super Admin actions performed through impersonation retain the actual Super Admin, target, session, action and timestamp and remain hidden from Admin/Manager. Role changes do not relabel those snapshots. Historical events lacking trustworthy actor-role evidence stay Super-Admin-only; no historical roles are invented or bulk rewritten. Existing actor fields referring to the affected account are not treated as actor-role evidence.

Existing `audit_logs` and `privileged_security_events` immutability remains. Generic CRM log rows also become read-only after insertion. No log editing/deletion rights are granted. Hidden Super Admin audit inserts use a confirmed minimal-return INSERT so ordinary target-context work does not fail by trying to SELECT its hidden audit row.

## Files changed for this request

| Files | Necessity |
| --- | --- |
| `src/features/crm/master-controls.js`, `master-backend.js`, `account-controls.js` | Immediate start/loading, system reason, backend readiness and reliable end/stranded-session handling |
| `src/features/crm/impersonation.js` | Existing selector plus a validated return destination |
| `src/features/crm/views/shell.js`, `src/app/globals.css` | Persistent verified-identity banner and scoped desktop/mobile offsets |
| `src/features/crm/log-visibility.js`, `views/access.js` | Matching limits for already-loaded/demo log rows and visible counts |
| `src/features/crm/runtime.js` | Actor-role snapshots, filtered log access, invalid-session recovery; prior job repair edits are retained |
| `src/features/crm/cloud-records.js` | Save hidden audit events without requiring SELECT permission |
| `src/app/[[...path]]/page.tsx` | Target landing permissions and invalid-selector recovery |
| `src/features/crm/ImpersonationRecovery.tsx`, `src/app/api/impersonation/exit/route.ts`, `src/proxy.ts` | Confirmed cleanup/recovery even when the original login expires or loses authority, using the existing exit endpoint |
| `supabase/migrations/20261027083107_one_click_impersonation_and_log_visibility.sql` | Focused proposed session, effective-authorization, audit snapshot and visibility dependencies |
| `tests/master.test.mjs`, `cloud-records.test.mjs`, `impersonation-controls.test.mjs`, `impersonation-logs-sql.test.mjs` | One-click, retry/error, SQL authorization, snapshots, role hierarchy, revocation, expiry, safe-helper grants and hidden-log insert tests |
| `tests/browser/accounts.spec.ts`, `tests/fixtures/hosted-accounts.js` | Existing account regressions plus desktop/mobile switching, refresh and originating-page return |
| `tests/fixtures/impersonation-deployed-contract.json`, `impersonation-schema.json` | Inspected schema/function-only fixtures; no user records or credentials |
| `tests/impersonation-logs-rollback.sql` | Reviewable live rollback verification; no persistent fixtures |
| This report | Deployment status, scope and approval explanation |

No dependencies were upgraded, no new business storage was introduced, and prior job-workflow work was not reverted or expanded in the frontend.

## Proposed database changes requiring approval

- Add `impersonation_sessions.auth_session_id`, its session foreign key and active-session index; preserve existing records.
- Add private effective/raw identity, verified context, target eligibility and owned-session cleanup helpers; update existing start/end/access-context functions.
- Substitute effective identity in existing permission resolvers and inspected identity-dependent account/chat/job/payment/stock functions and assignment policies. Their business checks/signatures remain. Definition hashes stop the migration on drift. These substitutions return the original identity in ordinary sessions.
- Add restrictive checks for impersonated `crm_records` reads/writes, retain the existing receipt actor boundary for the effective job actor, and retain password-operation exit requirements.
- Enforce the requested read hierarchy on `crm_records` logs, `audit_logs` and `privileged_security_events`, adding only the necessary Admin/Manager SELECT policy on eligible security events.
- Stamp future actor-role metadata in the existing log stores. Audit-only triggers retain both identities for scoped writes to CRM/stock and the inspected normalized tables used by job, payment and chat operations. They are inert outside impersonation.
- Revoke anonymous execution on all new helpers and use empty search paths. Narrow private SECURITY DEFINER helpers are needed to inspect protected session records, stamp trusted actors and clean up an owned session after revocation; business RPCs retain their existing privilege mode.

No existing table/function is dropped or renamed. No role/permission records or authentication credentials are reset. No business/history rows are migrated. The migration ends with a PostgREST schema-cache reload notification.

## Verification and status

- All 112 unit/SQL tests, type checks, and the production build passed. The final drift-guarded migration also passed its eight focused SQL integration cases.
- All 20 affected account, impersonation, job-workflow and approval browser tests passed. The refresh fixture route was corrected; desktop/mobile banner visibility, scrolling, refresh, target navigation and both return destinations are covered.
- Live rollback verification passed for AAL1 one-click creation, idempotency, session binding, target role, owner privilege exclusion, actual actor snapshots, Manager log exclusion, Installer assignments, expiry and return. All fixtures and temporary schema changes were rolled back. No rollback fixture records remain.
- Local tests also cover role peers, historical unknowns, role changes, module revocation, blocked targets, revoked owner authority, unauthorized selectors/direct calls, audit-table reads and helper execution grants.
- Security advisors were read before deployment; production post-install advisors and authenticated deployed UI verification remain pending because installation was rejected.
- `git diff --check` passed.

**Database/API:** not deployed; automatic approval review rejected the migration. **Frontend:** not deployed; no Vercel deployment credentials available. After explicit approval, apply only this reviewed migration, reload/verify the API, run post-install advisors, publish the frontend to the existing project with authorized deployment access, and verify the signed-in deployed behavior. Do not push the broader pending local migrations.
