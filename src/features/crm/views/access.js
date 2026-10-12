/** Preserved prototype views/access. Live services will replace browser mutations in runtime.js. */
export function createAccess(ctx) {
  function renderHostedOwnerLogin() {
    return `<main class="login"><div class="login-wrap"><section class="login-hero"><div class="brand-mark">IB</div><div class="eyebrow" style="color:#9ec0ff;margin-top:28px">Interior Blinds · Super Admin</div><h1>Your workspace.<br>Your controls.</h1><p>Sign in with your verified owner account to manage the workspace.</p></section><section class="login-panel"><div class="eyebrow">Separate owner portal</div><h2>Super Admin sign in</h2><p class="muted">Use the existing Supabase password for <strong style="overflow-wrap:anywhere">${ctx.OWNER_EMAIL}</strong>.</p><form class="form-stack" data-form="owner-login"><div class="field"><label>Email</label><input class="input" name="email" type="email" readonly value="${ctx.OWNER_EMAIL}" autocomplete="username"></div><div class="field"><label>Password</label><input class="input" name="password" type="password" autocomplete="current-password" required></div>${ctx.ui.ownerError ? `<div class="login-error" role="alert">${ctx.esc(ctx.ui.ownerError)}</div>` : ""}<button class="btn" type="submit" ${ctx.ui.ownerBusy || ctx.ui.ownerRestoring ? "disabled" : ""}>${ctx.ui.ownerRestoring ? "Checking your session…" : ctx.ui.ownerBusy ? "Signing in…" : "Open Super Admin dashboard"}</button></form><p class="small muted mt16">The offline demo password does not work here. Email confirmation, account status and the active session are checked by the backend.</p><p class="small muted">Operational records and staff controls in this standalone version remain local to this browser.</p></section></div></main>`;
  }

  function renderOwnerLogin() {
    if (ctx.hostedOwnerMode()) return ctx.renderHostedOwnerLogin();
    const setup = !ctx.state.masterAuth;
    return `<main class="login"><div class="login-wrap"><section class="login-hero"><div class="brand-mark">IB</div><div class="eyebrow" style="color:#9ec0ff;margin-top:28px">Interior Blinds · Super Admin</div><h1>Your workspace.<br>Your controls.</h1><p>Manage access, people and operations from a dedicated owner workspace.</p><div class="workflow">${["Access", "People", "Operations", "Audit"].map((x, i) => `<div class="workflow-step"><span class="workflow-num">${i + 1}</span><span>${x}</span></div>`).join("")}</div></section><section class="login-panel"><div class="eyebrow">Separate owner portal</div><h2>${setup ? "Set your owner password" : "Super Admin sign in"}</h2><p class="muted">Reserved account: <strong style="overflow-wrap:anywhere">${ctx.OWNER_EMAIL}</strong></p><form class="form-stack" data-form="owner-login"><div class="field"><label>Email</label><input class="input" name="email" type="email" value="${ctx.OWNER_EMAIL}" readonly autocomplete="username"></div><div class="field"><label>${setup ? "New password (12+ characters)" : "Password"}</label><input class="input" name="password" type="password" required ${setup ? 'minlength="12"' : ""} autocomplete="${setup ? "new-password" : "current-password"}"></div>${setup ? '<div class="field"><label>Confirm password</label><input class="input" name="confirm" type="password" minlength="12" required autocomplete="new-password"></div>' : ""}${ctx.ui.ownerError ? `<div class="login-error" role="alert">${ctx.esc(ctx.ui.ownerError)}</div>` : ""}<button class="btn" type="submit" ${ctx.ui.ownerBusy ? "disabled" : ""}>${ctx.ui.ownerBusy ? "Please wait…" : setup ? "Set password & open dashboard" : "Open Super Admin dashboard"}</button></form><p class="small muted mt16">Standalone workspace: setup and sign-in apply to this browser. This does not verify email ownership. Hosted production access needs server-side authentication for this account.</p></section></div></main>`;
  }

  function renderUltimateControl() {
    if (!ctx.isMasterSession()) return "";
    const staff = ctx.state.users.filter(
      (u) => u.id !== ctx.designatedOwner()?.id,
    );
    return (
      ctx.header(
        "SUPER ADMIN",
        "Ultimate access & control",
        "Control every staff role, module and function. These access and role overrides do not add activity-log entries.",
      ) +
      `<div class="master-note">The owner retains all modules and functions. Controls apply to Admins, Managers and Installers. Full access never grants ownership of this portal. Changes affect this standalone browser workspace.</div><section class="card card-pad mt16"><h3>Role-wide access</h3><p class="small muted">Apply to every current account in a role.</p><div class="row wrap gap8"><select class="select" id="ultimate-role"><option value="admin">Admins</option><option value="manager">Managers</option><option value="installer">Installers</option></select><button class="btn" data-action="ultimate-role-grant">Grant full staff access</button><button class="btn danger" data-action="ultimate-role-hide">Hide all modules / disable functions</button><button class="btn ghost" data-action="ultimate-role-reset">Restore role defaults</button></div></section><section class="card card-pad mt16"><h3>Global module locks</h3><p class="small muted">A lock hides the module for all staff, even accounts with full access. The owner stays unrestricted.</p><div class="permission-grid">${ctx.NAV.filter(
        (n) => n.page !== "master",
      )
        .map((n) => {
          const locked = ctx.state.accessControl.locks?.pages?.[n.page];
          return `<div class="permission-row"><div class="grow"><strong>${ctx.esc(n.label)}</strong><div class="detail">${locked ? "Locked for all staff" : "Available subject to permissions"}</div></div><button class="btn ${locked ? "success" : "danger"} sm" data-action="ultimate-lock" data-key="${ctx.attr(n.page)}">${locked ? "Unlock" : "Lock"}</button></div>`;
        })
        .join(
          "",
        )}</div></section><section class="mt16"><h3>Individual users & role override</h3>${staff.map((u) => `<article class="card card-pad mt12"><div class="row wrap gap12"><span class="avatar">${ctx.esc(u.avatar)}</span><div class="grow"><strong>${ctx.esc(u.name)}</strong><p class="small muted">${ctx.esc(u.email)} · ${ctx.esc(ctx.roleLabel(u.role))}</p></div>${ctx.badge(u.status)}${ctx.state.accessControl.users[u.id]?.fullAccess ? ctx.badge("Full staff access") : ""}</div><div class="row wrap gap8 mt12"><select class="select" data-ultimate-role="${ctx.attr(u.id)}">${["admin", "manager", "installer"].map((r) => `<option value="${r}" ${u.role === r ? "selected" : ""}>${ctx.esc(ctx.roleLabel(r))}</option>`).join("")}</select><button class="btn ghost sm" data-action="ultimate-change-role" data-id="${ctx.attr(u.id)}">Apply role override</button><button class="btn success sm" data-action="ultimate-grant" data-id="${ctx.attr(u.id)}">Full access</button><button class="btn danger sm" data-action="ultimate-hide" data-id="${ctx.attr(u.id)}">Hide all / disable all</button><button class="btn ghost sm" data-action="ultimate-reset" data-id="${ctx.attr(u.id)}">Restore defaults</button><button class="btn ghost sm" data-action="master-user-access" data-id="${ctx.attr(u.id)}">Per-tab / function controls</button></div></article>`).join("")}</section>`
    );
  }

  function renderMasterControl() {
    if (!ctx.isMasterSession())
      return '<div class="card empty">Super Admin sign-in required.</div>';
    const view = ctx.ui.masterView || "Overview",
      nav = `<div class="card card-pad" style="margin-bottom:20px"><div class="tabs" style="display:flex;flex-wrap:wrap;gap:4px">${["Overview", "Ultimate Control", "Access controls", "Accounts", "Security"].map((x) => `<button class="tab ${view === x ? "active" : ""}" data-action="master-view" data-view="${x}">${x}</button>`).join("")}</div></div>`;
    if (view === "Access controls") return nav + ctx.renderMasterPermissions();
    if (view === "Ultimate Control") return nav + ctx.renderUltimateControl();
    return `${ctx.header("SUPER ADMIN", "Owner command centre", "Manage your team, permissions and business operations from one place.", `<button class="btn ghost" data-page="logs">${ctx.icon("shield")} Audit logs</button><button class="btn" data-action="logout">Sign out</button>`)}${nav}${view === "Accounts" ? ctx.renderMasterAccounts() : view === "Security" ? ctx.renderMasterSecurity() : ctx.renderMasterOverview()}`;
  }

  function renderMasterOverview() {
    const staff = ctx.state.users.filter((u) => u.role !== "super_admin"),
      pending = ctx.state.tasks.filter((t) => t.status !== "Completed"),
      urgent = pending.filter((t) => t.priority === "Urgent"),
      returns = ctx.state.returns.filter(
        (r) => !["Processed", "Cancelled"].includes(r.status),
      ),
      requests = (ctx.state.productRequests || []).filter(
        (r) => r.status === "Awaiting approval",
      );
    return `<div class="metric-grid">${ctx.metric("Active accounts", String(staff.filter((u) => u.status === "Active").length), `${staff.filter((u) => u.status === "Blocked").length} blocked · ${staff.filter((u) => u.status === "Invited").length} invited`, "users", "green")}${ctx.metric("Active jobs", String(ctx.state.jobs.filter((j) => j.status !== "Completed").length), "Across every installer and stage", "briefcase")}${ctx.metric("Urgent tasks", String(urgent.length), `${pending.length} total open tasks`, "tasks", "red")}${ctx.metric("Open returns", String(returns.length), `${requests.length} product requests await approval`, "undo", "amber")}</div><div class="dashboard-grid"><section class="card card-pad">${ctx.sectionTitle("Owner controls", "Choose the workspace you want to manage.")}<button class="btn mt12" data-action="master-view" data-view="Ultimate Control">Ultimate access & role controls</button><div class="job-actions"><button class="btn" data-action="master-view" data-view="Access controls">Modules & permissions</button><button class="btn secondary" data-action="master-view" data-view="Accounts">Staff & login as user</button><button class="btn secondary" data-page="jobs">Jobs & status controls</button><button class="btn secondary" data-page="billing">Invoices & credits</button><button class="btn secondary" data-page="inventory">Inventory controls</button><button class="btn secondary" data-page="returns">Returns & inspections</button></div><div class="master-note mt16">Owner account: ${ctx.OWNER_EMAIL}. Staff cannot create another Super Admin or modify this account.${ctx.hostedOwnerMode() ? " Supabase verifies owner login. Operational records and these staff controls remain browser-local." : ""}</div></section><section class="card card-pad">${ctx.sectionTitle("Needs attention", "Open approvals and urgent work.")} ${requests
      .slice(0, 4)
      .map(
        (r) =>
          `<div class="list-row"><div class="grow"><strong>${ctx.esc(ctx.jobOf(r.jobId)?.number || "Job")} · ${ctx.esc(ctx.state.products.find((p) => p.id === r.productId)?.sku || "Product")}</strong><div class="list-sub">${ctx.esc(r.reason)}</div></div><button class="btn ghost sm" data-action="master-open-request" data-id="${r.id}">Review</button></div>`,
      )
      .join("")}${urgent
      .slice(0, 4)
      .map(
        (t) =>
          `<div class="list-row"><div class="grow"><strong>${ctx.esc(t.title)}</strong><div class="list-sub">${ctx.esc(ctx.userName(t.assignedTo))}</div></div><button class="btn ghost sm" data-action="open-task-work" data-id="${t.id}">Open</button></div>`,
      )
      .join(
        "",
      )}${!requests.length && !urgent.length ? '<p class="small muted">No pending product approvals or urgent tasks.</p>' : ""}</section></div><div class="mt16">${ctx.renderStockAlerts()}</div><section class="card card-pad mt16">${ctx.sectionTitle("Recent administration activity", "Sign-ins, access changes and operational events.", `<button class="btn ghost sm" data-page="logs">View audit logs</button>`)}${ctx.state.logs
      .slice(0, 6)
      .map(
        (l) =>
          `<div class="list-row"><div class="grow"><strong>${ctx.esc(l.action)}</strong><div class="list-sub">${ctx.esc(l.summary)}</div></div><span class="small muted">${ctx.fmt(l.createdAt, true)}</span></div>`,
      )
      .join("")}</section>`;
  }

  function renderMasterAccounts() {
    return `<section class="card card-pad">${ctx.sectionTitle("Staff accounts", "Create staff, manage their role, suspend access or inspect their workspace.", `<button class="btn" data-action="new-user">Create account</button>`)}${ctx.state.users
      .filter((u) => u.role !== "super_admin")
      .map(
        (u) =>
          `<article class="card card-pad mt16"><div class="row wrap gap12"><span class="avatar">${ctx.esc(u.avatar)}</span><div class="grow"><strong>${ctx.esc(u.name)}</strong><div class="list-sub" style="overflow-wrap:anywhere">${ctx.esc(u.email)} · ${ctx.roleLabel(u.role)}</div></div>${ctx.badge(u.status)}</div><div class="job-actions mt12"><button class="btn secondary sm" data-action="impersonate-user" data-id="${u.id}" ${u.status !== "Active" ? "disabled" : ""}>Login as user</button><button class="btn ghost sm" data-action="edit-user" data-id="${u.id}">Edit</button><button class="btn ghost sm" data-action="change-password" data-id="${u.id}">Password</button><button class="btn ghost sm" data-action="toggle-user" data-id="${u.id}">${u.status === "Active" ? "Block" : "Enable"}</button><button class="btn ghost sm" data-action="master-user-access" data-id="${u.id}">Permissions</button><button class="btn danger sm" data-action="delete-user" data-id="${u.id}">Delete</button></div></article>`,
      )
      .join("")}</section>`;
  }

  function renderMasterSecurity() {
    return `<section class="card card-pad"><h3>Owner account</h3><p class="strong" style="overflow-wrap:anywhere">${ctx.OWNER_EMAIL}</p><p class="small muted">Hosted login path: ${ctx.MASTER_PATH}. ${ctx.hostedOwnerMode() ? "Signed in through Supabase; the active owner session is checked by the backend." : `Local-file login uses #${ctx.OWNER_EMAIL}.`} The owner cannot be disabled or reassigned through staff controls.</p><h4 class="mt16">Change your password</h4><form class="form-stack mt12" data-form="owner-password"><div class="field"><label>Current password</label><input class="input" type="password" name="current" required autocomplete="current-password"></div><div class="form-grid"><div class="field"><label>New password (12+ characters)</label><input class="input" type="password" name="password" minlength="12" required autocomplete="new-password"></div><div class="field"><label>Confirm new password</label><input class="input" type="password" name="confirm" minlength="12" required autocomplete="new-password"></div></div><button class="btn" type="submit">Update owner password</button></form><p class="small muted mt16">${ctx.hostedOwnerMode() ? "This changes your existing Supabase account password. CRM operational data and staff account controls on this page are browser-local, not synchronized with Supabase." : "The local owner password is stored as a salted hash. Hosted sign-in uses your separate Supabase account password."}</p></section>`;
  }

  function renderMasterPermissions() {
    if (!ctx.isMasterSession())
      return `<div class="card empty"><h3>Access denied</h3><p>This workspace is restricted to the master account.</p></div>`;
    const staff = ctx.state.users.filter((u) => u.role !== "super_admin");
    if (
      ctx.ui.accessTarget !== "all" &&
      !staff.some((u) => u.id === ctx.ui.accessTarget)
    )
      ctx.ui.accessTarget = "all";
    const kind = ctx.ui.accessView === "Functions" ? "capabilities" : "pages",
      items =
        kind === "pages"
          ? ctx.NAV.filter((n) => n.page !== "master").map((n) => ({
              key: n.page,
              label: n.label,
              detail: `${n.section} module`,
            }))
          : ctx.CAPABILITIES;
    const target =
        ctx.ui.accessTarget === "all"
          ? null
          : staff.find((u) => u.id === ctx.ui.accessTarget),
      globalOff =
        Object.values(ctx.state.accessControl.global.pages).filter(
          (v) => v === false,
        ).length +
        Object.values(ctx.state.accessControl.global.capabilities).filter(
          (v) => v === false,
        ).length,
      userOverrides = Object.values(ctx.state.accessControl.users).reduce(
        (sum, x) =>
          sum +
          Object.keys(x.pages || {}).length +
          Object.keys(x.capabilities || {}).length,
        0,
      );
    const targetOptions = `<option value="all">All users</option>${staff.map((u) => `<option value="${u.id}" ${ctx.ui.accessTarget === u.id ? "selected" : ""}>${ctx.esc(u.name)} · ${ctx.roleLabel(u.role)}</option>`).join("")}`;
    return `${ctx.header("SUPER ADMIN", "Master Control", "Control module access, individual functions and every staff account from one protected workspace.", `<button class="btn ghost" data-page="logs">${ctx.icon("shield")} All audit logs</button><button class="btn" data-page="users">${ctx.icon("users")} Manage users</button>`)}<div class="metric-grid">${ctx.metric("Staff accounts", String(staff.length), "Admin, manager and installer profiles", "users", "green")}${ctx.metric("Disabled globally", String(globalOff), "Module and function restrictions", "x", "red")}${ctx.metric("User overrides", String(userOverrides), "Individual permission decisions", "settings", "amber")}${ctx.metric("Audit events", String(ctx.state.logs.length), "Immutable activity records", "shield")}</div><div class="card card-pad"><div class="master-target"><div class="field"><label>Apply controls to</label><select class="select" data-filter="accessTarget">${targetOptions}</select></div><div class="row wrap gap8">${target ? ctx.badge(ctx.roleLabel(target.role)) : ctx.badge("All users")}${target ? ctx.badge(target.status) : ctx.badge("Global scope")}</div></div><div class="master-note mt16">${ctx.icon("shield", "sm")} The master account always retains access. Global locks override every staff rule. Individual controls and full access remain subordinate to those locks. Access-control changes are silent in the activity log; Default restores inherited role access.</div></div><div class="card card-pad mt16"><div class="row wrap gap10" style="justify-content:space-between"><div class="tabs">${["Modules", "Functions"].map((v) => `<button class="tab ${ctx.ui.accessView === v ? "active" : ""}" data-action="master-access-view" data-view="${v}">${v}</button>`).join("")}</div><div class="row wrap gap6"><button class="btn success sm" data-action="bulk-access" data-kind="${kind}" data-value="true">Enable all</button><button class="btn danger sm" data-action="bulk-access" data-kind="${kind}" data-value="false">Disable all</button><button class="btn ghost sm" data-action="clear-access-overrides" data-kind="${kind}">Restore defaults</button></div></div><div class="permission-grid mt16">${items.map((item) => ctx.permissionRow(item, kind)).join("")}</div></div>`;
  }

  function renderUserActions(u, mobile = false) {
    const disabled = !ctx.canManageAccount(u);
    if (ctx.isMasterSession() && u.role !== "super_admin")
      return `<div class="${mobile ? "job-actions" : "table-actions"}"><button class="btn secondary sm" data-action="impersonate-user" data-id="${u.id}" ${disabled || u.status !== "Active" ? "disabled" : ""}>${ctx.icon("eye", "sm")} Login as</button><button class="btn ghost sm ${mobile ? "" : "icon-only"}" data-action="edit-user" data-id="${u.id}" ${disabled ? "disabled" : ""} title="Edit user">${ctx.icon("edit", "sm")}${mobile ? " Edit" : ""}</button><button class="btn ghost sm ${mobile ? "" : "icon-only"}" data-action="change-password" data-id="${u.id}" ${disabled ? "disabled" : ""} title="Change password">${ctx.icon("refresh", "sm")}${mobile ? " Password" : ""}</button><button class="btn ${u.status !== "Active" ? "success" : "danger"} sm ${mobile ? "" : "icon-only"}" data-action="toggle-user" data-id="${u.id}" ${disabled ? "disabled" : ""} title="${u.status !== "Active" ? "Enable" : "Disable"}">${ctx.icon(u.status !== "Active" ? "check" : "x", "sm")}${mobile ? ` ${u.status !== "Active" ? "Enable" : "Disable"}` : ""}</button><button class="btn danger sm ${mobile ? "" : "icon-only"}" data-action="delete-user" data-id="${u.id}" ${disabled ? "disabled" : ""} title="Delete user">${ctx.icon("trash", "sm")}${mobile ? " Delete" : ""}</button></div>`;
    return `<div class="${mobile ? "job-actions" : "table-actions"}"><button class="btn ghost sm ${mobile ? "" : "icon-only"}" data-action="reset-password" data-id="${u.id}" ${disabled ? "disabled" : ""} title="Reset password">${ctx.icon("refresh", "sm")}${mobile ? " Reset password" : ""}</button><button class="btn ${u.status !== "Active" ? "secondary" : "danger"} sm ${mobile ? "" : "icon-only"}" data-action="toggle-user" data-id="${u.id}" ${disabled ? "disabled" : ""} title="${u.status !== "Active" ? "Enable" : "Disable"}">${ctx.icon(u.status !== "Active" ? "check" : "x", "sm")}${mobile ? ` ${u.status !== "Active" ? "Enable" : "Disable"}` : ""}</button></div>`;
  }

  function renderUsers() {
    const visibleUsers =
      ctx.state.session.role === "super_admin"
        ? ctx.state.users
        : ctx.state.users.filter((u) => u.role !== "super_admin");
    const rows = visibleUsers
      .map((u) => {
        const jobs = ctx.state.jobs.filter(
            (j) => j.installerId === u.id && j.status !== "Completed",
          ).length,
          tasks = ctx.state.tasks.filter(
            (t) => t.assignedTo === u.id && t.status !== "Completed",
          ).length;
        return `<tr><td><div class="row gap10"><span class="avatar">${u.avatar}</span><div><strong>${ctx.esc(u.name)}</strong><div class="secondary-line">${ctx.esc(u.email)} · ${ctx.esc(u.phone)}</div></div></div></td><td>${ctx.badge(ctx.roleLabel(u.role))}</td><td>${ctx.badge(u.status)}</td><td>${u.lastLogin === "Never" ? "Never" : ctx.fmt(u.lastLogin, true)}</td><td>${jobs} jobs · ${tasks} tasks</td><td>${ctx.renderUserActions(u)}</td></tr>`;
      })
      .join("");
    const mobile = visibleUsers
      .map((u) => {
        const jobs = ctx.state.jobs.filter(
            (j) => j.installerId === u.id && j.status !== "Completed",
          ).length,
          tasks = ctx.state.tasks.filter(
            (t) => t.assignedTo === u.id && t.status !== "Completed",
          ).length;
        return `<div class="mobile-card"><div class="row gap10"><span class="avatar">${u.avatar}</span><div class="grow"><strong>${ctx.esc(u.name)}</strong><div class="secondary-line">${ctx.esc(u.email)}</div></div>${ctx.badge(u.status)}</div><div class="row wrap gap6 mt12">${ctx.badge(ctx.roleLabel(u.role))}${ctx.badge(`${jobs} jobs`)}${ctx.badge(`${tasks} tasks`)}</div>${ctx.renderUserActions(u, true)}</div>`;
      })
      .join("");
    return `${ctx.header("ACCESS CONTROL", "People, roles and account status.", "Authorised staff can onboard permitted roles, block access and initiate password resets.", `<button class="btn" data-action="new-user">${ctx.icon("plus")} Create account</button>`)}<div class="card"><div class="table-wrap desktop-table"><table class="data-table"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last login</th><th>Open work</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><div class="cards-mobile">${mobile}</div></div>`;
  }

  function renderLogs() {
    const q = ctx.ui.logSearch.toLowerCase(),
      logs = ctx.state.logs
        .map(ctx.auditLogDisplay)
        .filter(
          (l) =>
            `${l.action} ${l.entity} ${l.displayReference} ${l.displaySummary} ${l.displayUser}`
              .toLowerCase()
              .includes(q) &&
            (ctx.ui.logResult === "All" || l.result === ctx.ui.logResult),
        );
    return `${ctx.header("IMMUTABLE AUDIT", "Every privileged and operational action remains accountable.", "Authentication, impersonation, permissions, users, jobs, inventory and billing actions appear in one protected log.")}<div class="card toolbar"><input class="input" placeholder="Search action, reference, user or entity" value="${ctx.attr(ctx.ui.logSearch)}" data-filter="logSearch" data-focus="log-search"><select class="select" data-filter="logResult">${["All", "Success", "Warning", "Denied"].map((x) => `<option ${ctx.ui.logResult === x ? "selected" : ""}>${x}</option>`).join("")}</select></div><div class="card"><div class="table-wrap desktop-table"><table class="data-table"><thead><tr><th>Date</th><th>Action</th><th>Entity</th><th>Reference</th><th>Summary</th><th>User</th><th>Result</th></tr></thead><tbody>${logs.map((l) => `<tr><td>${ctx.fmt(l.createdAt, true)}</td><td class="primary-cell">${ctx.esc(l.action)}</td><td>${ctx.esc(l.entity)}</td><td>${ctx.esc(l.displayReference)}</td><td>${ctx.esc(l.displaySummary)}</td><td>${ctx.esc(l.displayUser)}</td><td>${ctx.badge(l.result)}</td></tr>`).join("")}</tbody></table></div><div class="cards-mobile">${logs.map((l) => `<div class="mobile-card"><div class="job-top"><strong>${ctx.esc(l.action)}</strong>${ctx.badge(l.result)}</div><p class="small muted">${ctx.esc(l.displaySummary)}</p><div class="secondary-line">${ctx.esc(l.entity)} · ${ctx.esc(l.displayReference)} · ${ctx.esc(l.displayUser)} · ${ctx.fmt(l.createdAt, true)}</div></div>`).join("")}</div></div>`;
  }

  function renderProfile() {
    const u = ctx.currentUser(),
      master = ctx.isMasterSession(),
      available = ctx.NAV.filter((n) => ctx.allowedPage(n.page)).length;
    const accessCard = master
      ? `<div class="card card-pad">${ctx.sectionTitle("Master account", "Protected access to every module, function, user and audit event.")}<div class="master-note">${ctx.icon("shield", "sm")} The master profile cannot be disabled by staff permissions and remains hidden from normal account lists.</div><div class="job-actions"><button class="btn" data-page="master">${ctx.icon("settings")} Master Control</button><button class="btn ghost" data-page="logs">${ctx.icon("shield")} Audit logs</button><button class="btn ghost" data-page="users">${ctx.icon("users")} Users</button></div></div>`
      : `<div class="card card-pad">${ctx.sectionTitle("Access level", "Your available modules and functions are controlled by account permissions.")}<div class="facts">${ctx.infoFact("Role", ctx.roleLabel(u.role))}${ctx.infoFact("Available modules", String(available))}${ctx.infoFact("Account status", u.status)}</div>${ctx.isImpersonating() ? `<div class="master-note mt16">This is an audited impersonation session. Use the banner above to return to the master account.</div>` : ""}</div>`;
    return `${ctx.header("ACCOUNT", "Profile and access.", "Review the active account, role and permission status.")}<div class="dashboard-grid"><div class="card card-pad"><div class="row gap12"><span class="avatar" style="width:74px;height:74px;font-size:20px">${u.avatar}</span><div><h2 style="margin:0">${ctx.esc(u.name)}</h2><p class="muted">${ctx.esc(u.email)}</p><div class="row gap6">${ctx.badge(ctx.roleLabel(u.role))}${ctx.badge(u.status)}</div></div></div><div class="divider"></div>${ctx.infoFact("Phone", u.phone)}<div class="mt8">${ctx.infoFact("Last login", u.lastLogin === "Never" ? "Never" : ctx.fmt(u.lastLogin, true))}</div><div class="mt8">${ctx.infoFact("Data mode", "Persistent demo data")}</div><button class="btn ghost mt16" data-action="logout">${ctx.icon("logout")} Sign out</button></div>${accessCard}</div>${master ? `<div class="card card-pad mt16">${ctx.sectionTitle("Demo workspace", "Reset operational demo data while retaining the immutable audit history.")}<div class="row wrap gap12"><div class="grow"><strong>Reset demo data</strong><p class="small muted">Leads, jobs, scans, invoices, payments, users and permissions return to their original state. Existing audit events are retained.</p></div><button class="btn danger" data-action="reset-demo">${ctx.icon("refresh")} Reset</button></div></div>` : ""}`;
  }

  function renderNewUser() {
    const choices = {
        super_admin: ["admin", "manager", "installer"],
        admin: ["admin", "manager", "installer"],
        manager: ["manager", "installer"],
      },
      roles = choices[ctx.state.session.role] || [];
    return ctx.modalFrame(
      "Create staff account",
      "Create a prototype invitation for one of the permitted user types.",
      `<form class="form-stack" id="user-form"><div class="field"><label class="required">Full name</label><input class="input" name="name" required></div><div class="field"><label class="required">Email</label><input class="input" type="email" name="email" required></div><div class="field"><label>Phone</label><input class="input" name="phone"></div><div class="field"><label>Role</label><select class="select" name="role">${roles.map((x) => `<option value="${x}" ${x === "installer" ? "selected" : ""}>${ctx.roleLabel(x)}</option>`).join("")}</select></div></form>`,
      "",
      "close-modal",
      `<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="create-user">${ctx.icon("mail")} Create invitation</button>`,
    );
  }

  function renderEditUser(id) {
    const u = ctx.state.users.find((x) => x.id === id);
    if (!u || !ctx.isMasterSession() || u.role === "super_admin") return "";
    return ctx.modalFrame(
      "Edit user",
      `${u.name} · ${ctx.roleLabel(u.role)}`,
      `<form class="form-stack" id="edit-user-form"><div class="field"><label class="required">Full name</label><input class="input" name="name" value="${ctx.attr(u.name)}" required></div><div class="field"><label class="required">Email</label><input class="input" type="email" name="email" value="${ctx.attr(u.email)}" required></div><div class="field"><label>Phone</label><input class="input" name="phone" value="${ctx.attr(u.phone)}"></div><div class="field"><label>Role</label><select class="select" name="role">${["admin", "manager", "installer"].map((r) => `<option value="${r}" ${u.role === r ? "selected" : ""}>${ctx.roleLabel(r)}</option>`).join("")}</select></div></form>`,
      "",
      "close-modal",
      `<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="save-user-edit" data-id="${u.id}">${ctx.icon("check")} Save changes</button>`,
    );
  }

  function renderChangePassword(id) {
    const u = ctx.state.users.find((x) => x.id === id);
    if (!u || !ctx.isMasterSession() || u.role === "super_admin") return "";
    return ctx.modalFrame(
      "Change user password",
      `${u.name} · ${u.email}`,
      `<form class="form-stack" id="change-password-form"><div class="field"><label class="required">New password</label><input class="input" type="password" name="password" minlength="6" required></div><div class="field"><label class="required">Confirm password</label><input class="input" type="password" name="confirmPassword" minlength="6" required></div><div class="form-note">The new password takes effect on the next sign-in. Existing sessions are not retained in this standalone prototype.</div></form>`,
      "",
      "close-modal",
      `<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="save-user-password" data-id="${u.id}">${ctx.icon("shield")} Change password</button>`,
    );
  }

  function renderDeleteUser(id) {
    const u = ctx.state.users.find((x) => x.id === id);
    if (!u || !ctx.isMasterSession() || u.role === "super_admin") return "";
    return ctx.modalFrame(
      "Delete user",
      `Permanently remove ${u.name} from this prototype.`,
      `<div class="form-note" style="background:var(--red2);color:var(--red);border-color:transparent"><strong>${ctx.esc(u.name)}</strong> will be deleted. Assigned leads, tasks and jobs will be left unassigned. This can only be recovered by resetting the demo data.</div>`,
      "",
      "close-modal",
      `<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn danger" data-action="confirm-delete-user" data-id="${u.id}">${ctx.icon("trash")} Delete user</button>`,
    );
  }
  return {
    renderHostedOwnerLogin,
    renderOwnerLogin,
    renderUltimateControl,
    renderMasterControl,
    renderMasterOverview,
    renderMasterAccounts,
    renderMasterSecurity,
    renderMasterPermissions,
    renderUserActions,
    renderUsers,
    renderLogs,
    renderProfile,
    renderNewUser,
    renderEditUser,
    renderChangePassword,
    renderDeleteUser,
  };
}
