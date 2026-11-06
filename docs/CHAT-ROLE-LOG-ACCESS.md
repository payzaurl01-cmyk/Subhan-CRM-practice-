# Chat roles and audit visibility

The frontend keeps the designated Super Admin outside ordinary chat. Other staff cannot select the Super Admin as a recipient. The Super Admin cannot open Chat or send directly. An audited **Login as user** session uses the selected user's effective role and identity, including that user's chat permissions.

The focused migration `20261106070000_chat_role_and_log_visibility.sql` applies the same rule to both the legacy `crm_records` chat and normalized chat tables. Restrictive RLS policies hide existing Super Admin conversations and messages, reject direct writes, and prevent adding the Super Admin to a conversation. A membership trigger also covers chat RPCs that run as `SECURITY DEFINER`. The existing privileged chat-review RPC is unchanged.

Audit visibility uses server-stamped actor roles:

| Viewer | Visible actor roles |
| --- | --- |
| Super Admin | All, including historical events without a trusted actor-role snapshot |
| Admin | Admin, Manager, Installer |
| Manager | Manager, Installer |
| Installer, if separately granted Audit Logs access | Installer |

The migration grants Managers `settings.view`, which backs the Audit Logs page. It grants no settings mutation permission. Existing individual and global access restrictions still apply. New CRM, audit, and security events record the actual signed-in actor; impersonated actions remain Super Admin events. Historical events without a trusted actor-role snapshot remain Super-Admin-only. The migration does not relabel or delete existing events.

## Release status

Implemented and verified locally; **not deployed**. The connected production database currently lacks the log hierarchy, and the new migration has not been applied. Apply only this focused migration after reviewing it against the current database; do not run an unfiltered migration push because older local proposals remain pending. Deploy the matching frontend after the database migration, then verify direct and impersonated chat plus the three log views with real signed-in sessions. The local PGlite test exercises the policy and trigger behavior but does not replace that hosted-session check.

Validation: all 130 unit/SQL tests, typecheck, and the final production build passed. The database tests use isolated PGlite data; no production records were changed.
