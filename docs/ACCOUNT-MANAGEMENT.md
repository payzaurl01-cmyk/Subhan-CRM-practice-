# Account management

All active roles, including the designated Super Admin, use `/login` and the normal CRM workspace. `/owner` compatibility routes and protected Master Control remain. The existing five Master Control tabs and full module/action editor are restored in source; account delegation extends that interface.

`get_access_context({p_platform:'web'})` provides authoritative `users.can_create`, `can_update`, `can_change_role`, `can_change_password`, `can_block` and `can_delete`. Account mutations revalidate these flags; backend RPCs/RLS enforce the current decision independently. Admin/Manager permissions can be revoked. Owner/self-account and linked-history protections remain.

| Action                  | Authenticated operation                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Create account          | Existing `create-user` invitation flow, with pending flag-based Manager compatibility update |
| Edit name/phone         | Whitelisted `profiles` update requiring a returned row                                       |
| Role                    | `admin_update_user_access`, retaining current status                                         |
| Block/unblock           | `admin_set_user_blocked`                                                                     |
| Delete eligible account | `admin_delete_user`, after confirmation                                                      |
| Another user's password | Existing `owner-change-password`; 12–1024 characters                                         |
| Own password            | `auth.updateUser({password})`                                                                |
| Ordinary delegation     | `admin_set_role_permission` / `admin_set_user_permission`                                    |
| Explicit override       | New focused `admin_set_access_rule` extension                                                |
| Login as / exit         | Existing audited impersonation RPCs plus effective-identity enforcement extension            |

Password fields clear before the account request. Credentials are never saved to CRM state or URLs. Backend failures are displayed; `password_changed:true` is partial completion and never retried automatically. Invitations similarly distinguish confirmed completion from partial creation. Self-service is independent of delegated authority to change other profiles' passwords. Installer delegation cannot grant account-administration powers. Admin/Manager cannot administer the protected owner's password or edit Master Control.

Permissions refresh after mutations, focus, visibility, reconnect, permitted Realtime events and polling. Changes clear stale protected state and close affected dialogs. Database authorization also rejects direct/stale requests. Sign-in email remains read-only because changing the profile column alone would not change Auth identity.

See [Master Control restoration, verification and deployment](MASTER-CONTROL-RESTORATION.md) for the recovered Git regression, precedence, file/function changes, impersonation service boundary and required release order. The frontend, focused migration and `create-user` update remain pending deployment. No existing account was recreated and no real password was changed during implementation/testing. Do not describe the live site as repaired until deployed acceptance checks pass.
