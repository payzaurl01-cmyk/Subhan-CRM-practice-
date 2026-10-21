# Account management

All active roles sign in through `/login` and enter the normal CRM workspace. `/owner` is a compatibility redirect. Super Admin permission tools remain protected by the backend `master_control` grant; normal dashboard access does not require an owner-portal RPC.

`get_access_context({ p_platform: 'web' })` supplies the current profile and module permissions. Users-page actions use `can_update`, `can_change_role`, `can_change_password`, `can_block`, and `can_delete` from the `users` module. Admin and Manager are not subject to additional frontend role hierarchy restrictions. The backend remains authoritative.

| Action               | Authenticated backend operation                                    |
| -------------------- | ------------------------------------------------------------------ |
| Edit name / phone    | Update `public.profiles`, require a returned row                   |
| Change role          | `admin_update_user_access`, preserving the target's current status |
| Block / unblock      | `admin_set_user_blocked`                                           |
| Change password      | `owner-change-password` with the signed-in user's bearer session   |
| Delete               | `admin_delete_user`, after a confirmation dialog                   |
| Role permissions     | `admin_set_role_permission` for Admin / Manager, `allow` or `deny` |
| Individual overrides | `admin_set_user_permission`, `allow`, `deny`, or `default`         |

Sign-in email is displayed read-only, since changing a profile email alone would not update the Auth identity. Account creation and demo impersonation/reset controls are not exposed as hosted account-management actions. Existing accounts and passwords are untouched by this implementation.

Super Admin cannot be blocked, deleted, reassigned, or given staff overrides. Only Super Admin may edit the protected profile or change its password. The active account cannot block/delete itself or change its own role. Deletion does not locally unassign work or discard history: the backend enforces linked-record/file restrictions and displays its actual error.

Each mutation rechecks the live access context. Successful mutations require `true` from RPCs, a returned profile row, or `success: true` from the password function. Password fields clear before the asynchronous request; credentials are not stored in application state or logs. `password_changed: true` errors show partial completion, close the password dialog, and never trigger an automatic retry.

Accounts and permission rules refresh after every attempted mutation. Access also refreshes on window focus, visibility restoration, reconnect, authentication changes, permitted Realtime events, and every 30 seconds. Unmounting removes subscriptions and timers. Permission changes close open account dialogs. Inactive profiles, locked workspaces, and sessions with no module grants remove the workspace; backend authorization denies stale actions independently of the UI refresh interval. The deployed resolver checks `auth.sessions`, so a revoked session cannot retain access merely because its JWT/profile has not expired.

## Validation

- `npm test`: account adapter contracts, per-action revocation, protected accounts, row confirmation, backend failures, password session forwarding, partial password completion, and permission overrides, plus existing route/lifecycle checks.
- `npm run test:e2e`: existing CRM flows plus hosted-runtime fixtures for Admin, Manager, Super Admin, deletion, password errors, access refresh, permission toggles, and mobile layout. Fixtures make no live account writes and do not reset real passwords.
- `npm run typecheck` and `npm run build` validate the Next.js application. Browser tests use `.next-e2e` to coexist with the developer's existing server.
- Read-only inspection confirmed the deployed RPC signatures, authorization/protection logic, profile fields/RLS, Realtime publication, and password-function behavior in `moevynyglfeebzegttfl`. An unauthenticated `get_access_context('web')` call was rejected with `Authentication required`.

## Deployment status

Source implementation and local validation are complete. No production frontend deployment has been performed from this session. Vercel is not connected, and no local Vercel CLI/project credentials were found. The existing live CRM must not be described as fixed by these local changes.

Once deployment access is connected, deploy this repository to the existing Vercel project with its current public Supabase configuration. The already-deployed password function allows the production origin `https://crminteriorblindandshutters.vercel.app`; preview/local origins are not allowed by that function. Do not rerun migrations or redeploy that function just to change its origin. Verify sign-in, effective permissions, and account-control visibility on production using an existing authorized session. Any destructive account/password verification requires an explicitly designated test account.
