# Remaining live workflow integrations

The Next.js conversion preserves prototype behavior. Connect these workflows to the already upgraded database in a separate integration phase.

| Area               | Remaining work                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Auth               | Real sessions, staff invitations, password recovery, blocked-account enforcement          |
| Permissions        | Server-side checks, roles, module locks, owner controls and impersonation                 |
| Records            | Leads, contacts, quotations, jobs and tasks persisted through live services               |
| Quotes             | Immutable document snapshots, send/accept/reject, atomic job conversion                   |
| Jobs               | Stage gates, holds, reopen actions, assignments and task generation                       |
| Original stock     | Location confirmation, scan matching, reserve consumption and issue exactly once          |
| Extra products     | Request/approval RPC wiring, scan/issue, cancellation and reserve release                 |
| Returns            | Planning, collection, handover, delivery, cancellation and inspections                    |
| Stock receipts     | Supplier/PO forms and atomic partial/full receipt command wiring                          |
| Evidence           | Private Storage, server verification, fresh geolocation and signed media URLs             |
| Completion         | Validate usage, evidence, tasks, requests and returns before completing                   |
| Finance            | Billing bases, final settlement, invoice/credit issuance, payment allocation and refunds  |
| Email              | Private configuration, outbox worker, provider callbacks, reminders and document delivery |
| Reports            | Permission-checked report queries, filters, CSV/PDF and evidence thumbnails               |
| Chat               | Authenticated conversations, attachments, per-user read state and live notifications      |
| Dashboard/calendar | Live queries with permissions and subscriptions                                           |

The previously installed commands to wire are `crm_request_product`, `crm_decide_product_request`, `crm_confirm_billing_basis`, `crm_receive_po`, and `crm_allocate_credit`. Recheck signatures against the live project during integration. Other prototype workflow actions still require backend implementations or existing command validation.

Keep public client configuration separate from server credentials. Do not place a service-role key in browser code. Preserve real-actor auditing when implementing impersonation. Replace browser-only permission decisions and business mutations with authenticated service calls and transactions.

Recommended order: Auth/permissions → live records → jobs/stock → returns/evidence → finance → email/reports/realtime.
