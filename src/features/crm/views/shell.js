/** Preserved prototype views/shell. Live services will replace browser mutations in runtime.js. */
export function createShell(ctx) {
  function renderLogin() {
    const accounts = [
      {
        role: "admin",
        email: "admin@demo.com",
        label: "Admin",
        detail: "Full CRM, staff, billing and audit logs",
        icon: "settings",
      },
      {
        role: "manager",
        email: "manager@demo.com",
        label: "Manager",
        detail: "Jobs, inventory, billing and staff",
        icon: "users",
      },
      {
        role: "installer",
        email: "installer@demo.com",
        label: "Installer",
        detail: "Assigned jobs, tasks and scanning",
        icon: "briefcase",
      },
    ];
    const selected = accounts.find((a) => a.email === ctx.ui.loginEmail);
    return `<main class="login"><div class="login-wrap"><section class="login-hero"><div class="brand-mark">CD</div><div class="eyebrow" style="color:#9ec0ff;margin-top:28px">CRM Development</div><h1>The business, from first call to final fitting.</h1><p>Sales, jobs, warehouse, installers and billing in one field-ready workspace.</p><div class="workflow">${["Lead", "Job", "Pick", "Install", "Invoice"].map((x, i) => `${i ? '<div class="workflow-line"></div>' : ""}<div class="workflow-step"><span class="workflow-num">${i + 1}</span><span>${x}</span></div>`).join("")}</div><div class="login-foot row gap10">${ctx.icon("dashboard", "lg")}<strong>One responsive app for web, tablet and mobile.</strong></div></section><section class="login-panel"><div class="eyebrow">Demo workspace</div><h2>Choose your role</h2><p class="muted">The interface and available data adapt to each role.</p><div class="account-list">${accounts.map((a) => `<button class="account ${a.email === ctx.ui.loginEmail ? "active" : ""}" data-action="select-account" data-email="${a.email}"><span class="icon-box">${ctx.icon(a.icon)}</span><span class="grow"><span class="title">${a.label}</span><span class="detail">${a.detail}</span></span>${a.email === ctx.ui.loginEmail ? ctx.icon("check") : ""}</button>`).join("")}</div><form class="form-stack" data-form="login"><div class="field"><label>Email</label><input class="input" type="email" value="${ctx.attr(ctx.ui.loginEmail)}" data-ui="loginEmail" data-focus="login-email"></div><div class="field"><label>Password</label><input class="input" type="password" value="${ctx.attr(ctx.ui.loginPassword)}" data-ui="loginPassword" data-focus="login-password"></div>${ctx.ui.loginError ? `<div class="login-error">${ctx.esc(ctx.ui.loginError)}</div>` : ""}<button class="btn" type="submit">Enter as ${ctx.esc(selected?.label || "user")} ${ctx.icon("arrow")}</button></form><div class="center muted small mt12">Demo password: <strong>demo123</strong></div></section></div></main>`;
  }

  function renderShell() {
    const user = ctx.currentUser(),
      role = ctx.state.session.role,
      allowed = ctx.NAV.filter((n) => ctx.visiblePage(n.page));
    let prev = "";
    const openTasks = ctx.state.tasks.filter(
      (t) => t.status !== "Completed" && ctx.canViewTask(t),
    ).length;
    const unreadChat = ctx.chatUnreadCount();
    const nav = allowed
      .map((n) => {
        const sec =
          n.section !== prev
            ? `<div class="nav-section">${n.section}</div>`
            : "";
        prev = n.section;
        const count =
          n.page === "tasks" ? openTasks : n.page === "chat" ? unreadChat : 0;
        return `${sec}<a href="#${n.page}" class="nav-item ${ctx.ui.page === n.page ? "active" : ""}" data-page="${n.page}">${ctx.icon(n.icon)}<span>${n.label}</span>${count ? `<span class="badge count ${ctx.ui.page === n.page ? "dark" : ""}">${count > 9 ? "9+" : count}</span>` : ""}</a>`;
      })
      .join("");
    const unread = ctx
      .visibleNotifications()
      .filter((n) => !ctx.stockAlertRead(n)).length;
    const banner = ctx.isImpersonating()
      ? `<div class="impersonation-bar">${ctx.icon("eye", "sm")} Signed in as ${ctx.esc(user.name)} (${ctx.esc(ctx.roleLabel(user.role))}) through an audited Super Admin session.<button class="btn sm" data-action="end-impersonation">Exit impersonation</button></div>`
      : "";
    return `<div class="app-shell"><aside class="sidebar"><div class="side-brand"><div class="brand-mark">CD</div><div><strong>CRM Development</strong><small>Operations workspace</small></div></div><div class="live-strip"><span class="dot"></span>Operations live</div><nav class="side-nav">${nav}</nav><button class="side-user" style="border-left:0;border-right:0;border-bottom:0;background:transparent;color:inherit;text-align:left" data-page="profile"><span class="avatar">${ctx.esc(user.avatar)}</span><span class="grow"><span class="name">${ctx.esc(user.name)}</span><span class="role">${ctx.esc(ctx.roleLabel(user.role))}</span></span>${ctx.icon("arrow")}</button></aside><main class="app-main">${banner}<header class="topbar"><button class="btn ghost icon-only mobile-menu-btn" data-action="mobile-menu" aria-label="Open menu">${ctx.icon("menu")}</button><div class="topbar-title"><small>${role === "installer" ? "FIELD WORKSPACE" : "COMMAND CENTRE"}</small><h2>${role === "installer" && ctx.ui.page === "dashboard" ? "My field day" : ctx.PAGE_TITLES[ctx.ui.page]}</h2></div><div class="top-actions"><button class="search-trigger" data-action="open-search">${ctx.icon("search")}<span>Search jobs, clients, invoices…</span><span class="kbd">⌘K</span></button><button class="btn ghost icon-only bell" data-action="open-notifications" aria-label="Notifications">${ctx.icon("bell")}${unread ? `<span class="bell-count">${unread > 9 ? "9+" : unread}</span>` : ""}</button><span class="avatar">${ctx.esc(user.avatar)}</span></div></header><section class="content">${ctx.renderPage()}</section>${ctx.renderMobileTabs(role)}</main></div>${ctx.ui.mobileMenu ? ctx.renderMobileMenu(allowed, user) : ""}${ctx.renderChatDock()}`;
  }

  function renderMobileTabs(role) {
    const pages = (
      role === "installer"
        ? ["dashboard", "jobs", "tasks", "picking"]
        : ["dashboard", "jobs", "tasks", "billing"]
    ).filter(ctx.visiblePage);
    return `<nav class="mobile-tabs">${pages
      .map((p) => {
        const n = ctx.NAV.find((x) => x.page === p);
        return `<button class="mobile-tab ${ctx.ui.page === p ? "active" : ""}" data-page="${p}">${ctx.icon(n.icon)}<span>${n.label.split(" ")[0]}</span></button>`;
      })
      .join(
        "",
      )}<button class="mobile-tab" data-action="mobile-menu">${ctx.icon("menu")}<span>More</span></button></nav>`;
  }

  function renderMobileMenu(allowed, user) {
    let prev = "";
    return `<div class="mobile-menu"><div class="mobile-menu-panel"><div class="row gap10" style="padding-bottom:14px;border-bottom:1px solid #29466c"><span class="avatar">${user.avatar}</span><div class="grow"><strong>${ctx.esc(user.name)}</strong><div class="small muted" style="color:#b8c9e2">${ctx.esc(ctx.roleLabel(user.role))}</div></div><button class="btn ghost icon-only" data-action="mobile-menu" style="background:transparent;color:#fff;border-color:#355276">${ctx.icon("x")}</button></div>${allowed
      .map((n) => {
        const sec =
          n.section !== prev
            ? `<div class="nav-section">${n.section}</div>`
            : "";
        prev = n.section;
        return `${sec}<a class="nav-item ${ctx.ui.page === n.page ? "active" : ""}" data-page="${n.page}">${ctx.icon(n.icon)}${n.label}</a>`;
      })
      .join("")}</div></div>`;
  }

  function renderPage() {
    if (!ctx.allowedPage(ctx.ui.page))
      return `<div class="empty">This page is not available to your account.</div>`;
    return (
      ctx.renderWorkContext() +
      (
        {
          dashboard: ctx.renderDashboard,
          master: ctx.renderMasterControl,
          chat: ctx.renderChat,
          leads: ctx.renderLeads,
          contacts: ctx.renderContacts,
          quotes: ctx.renderQuotes,
          jobs: ctx.renderJobs,
          tasks: ctx.renderTasks,
          calendar: ctx.renderCalendar,
          inventory: ctx.renderInventory,
          picking: ctx.renderPicking,
          returns: ctx.renderReturns,
          purchasing: ctx.renderPurchasing,
          email: ctx.renderEmailSettingsPage,
          billing: ctx.renderBilling,
          reports: ctx.renderReports,
          users: ctx.renderUsers,
          logs: ctx.renderLogs,
          profile: ctx.renderProfile,
        }[ctx.ui.page] || ctx.renderDashboard
      )()
    );
  }

  function renderDashboard() {
    const role = ctx.state.session.role,
      user = ctx.currentUser(),
      installer = role === "installer";
    const jobs = ctx.state.jobs.filter(
        (j) => !installer || j.installerId === user.id,
      ),
      tasks = ctx.state.tasks.filter(ctx.canViewTask);
    const active = jobs.filter((j) => j.status !== "Completed"),
      open = tasks.filter((t) => t.status !== "Completed"),
      outstanding = ctx.state.invoices.reduce((s, x) => s + x.balance, 0),
      overdue = ctx.state.invoices
        .filter((x) => x.status === "Overdue")
        .reduce((s, x) => s + x.balance, 0);
    const metrics = installer
      ? [
          ctx.metric(
            "Jobs today",
            String(
              jobs.filter(
                (j) =>
                  new Date(j.installationDate).toDateString() ===
                  new Date().toDateString(),
              ).length,
            ),
            "Assigned installation and collection work",
            "calendar",
            "green",
          ),
          ctx.metric(
            "Open tasks",
            String(open.length),
            "Tasks requiring your action",
            "tasks",
            "red",
          ),
          ctx.metric(
            "Ready to collect",
            String(
              jobs.filter((j) => j.status === "Ready for Collection").length,
            ),
            "Warehouse orders prepared",
            "box",
            "amber",
          ),
          ctx.metric(
            "Return pending",
            String(jobs.filter((j) => j.status === "Return Pending").length),
            "Unused products to reconcile",
            "undo",
          ),
        ]
      : [
          ctx.metric(
            "Active jobs",
            String(
              ctx.state.jobs.filter((j) => j.status !== "Completed").length,
            ),
            "Across warehouse and installations",
            "briefcase",
            "green",
          ),
          ctx.metric(
            "Tasks due",
            String(
              ctx.state.tasks.filter((t) => t.status !== "Completed").length,
            ),
            "Open accountable actions",
            "tasks",
            "red",
          ),
          ctx.metric(
            "Outstanding",
            ctx.money(outstanding),
            `${ctx.money(overdue)} currently overdue`,
            "receipt",
            "amber",
          ),
          ctx.metric(
            "Stock alerts",
            String(ctx.state.products.filter(ctx.lowStockProduct).length),
            "Low or fully reserved products",
            "box",
          ),
        ];
    const live = active
      .slice()
      .sort(
        (a, b) => new Date(a.installationDate) - new Date(b.installationDate),
      )
      .slice(0, 5);
    const categories = [
      "Sales",
      "Warehouse",
      "Picking",
      "Collection",
      "Installation",
      "Return",
      "Billing",
    ];
    return `${ctx.header(installer ? "FIELD DASHBOARD" : "OPERATIONS OVERVIEW", installer ? `Good morning, ${user.name.split(" ")[0]}` : "Everything moving, in one view.", installer ? "Your collections, installations and return tasks are ready below." : "Monitor the full flow from enquiry to payment without opening five different systems.", !installer ? `<button class="btn" data-page="leads">${ctx.icon("plus")} Create lead</button>` : "")}<div class="metric-grid">${metrics.join("")}</div>${ctx.renderStockAlerts()}<div class="dashboard-grid"><div class="stack"><div class="card card-pad">${ctx.sectionTitle(installer ? "Your next jobs" : "Live job board", installer ? "Ordered by installation date" : "Operational jobs needing attention", `<button class="btn ghost sm" data-page="jobs">Open jobs</button>`)}${live.length ? live.map((j) => `<div class="list-row"><span class="icon-box ${j.status === "Ready for Collection" ? "green" : ""}">${ctx.icon(j.status === "Ready for Collection" ? "box" : "briefcase")}</span><div class="grow"><div class="list-title">${ctx.esc(j.number)} · ${ctx.esc(j.customer)}</div><div class="list-sub">${ctx.esc(j.service)} · ${ctx.esc(j.suburb)}</div><div class="row wrap gap6 mt8">${ctx.jobBadges(j)}${!installer ? ctx.badge(ctx.userName(j.installerId)) : ""}${ctx.badge(ctx.fmt(j.installationDate))}</div></div><button class="btn ghost sm" data-action="open-job-work" data-id="${j.id}">${ctx.icon("arrow")}</button></div>`).join("") : `<div class="empty">No active jobs.</div>`}</div>${
      !installer
        ? `<div class="card card-pad">${ctx.sectionTitle("Revenue movement", "Invoiced and paid across current jobs")}<div class="row" style="justify-content:space-between"><div><div class="muted small">Total invoiced</div><div style="font-size:25px;font-weight:900;margin-top:5px">${ctx.money(ctx.state.invoices.reduce((s, x) => s + x.total, 0))}</div></div>${ctx.badge("18% this month")}</div>${(() => {
            const total =
                ctx.state.invoices.reduce((s, x) => s + x.total, 0) || 1,
              paid = ctx.state.invoices.reduce((s, x) => s + x.paid, 0);
            return `<div class="revenue-bar"><span class="paid" style="width:${(paid / total) * 100}%"></span></div><div class="row gap12 small"><span><i class="dot" style="color:var(--green);display:inline-block"></i> Paid ${ctx.money(paid)}</span><span><i class="dot" style="color:var(--blue);display:inline-block"></i> Outstanding ${ctx.money(outstanding)}</span></div>`;
          })()}</div>`
        : ""
    }</div><div class="stack"><div class="card card-pad">${ctx.sectionTitle(installer ? "Today’s workload" : "Task pressure", "Completion across open work")}${categories
      .map((c) => {
        const xs = tasks.filter((t) => t.category === c);
        if (!xs.length) return "";
        const done = xs.filter((t) => t.status === "Completed").length;
        return `<div class="workload"><div class="workload-head"><span>${c}</span><span>${done}/${xs.length}</span></div><div class="progress"><span style="width:${xs.length ? (done / xs.length) * 100 : 0}%"></span></div></div>`;
      })
      .join("")}</div>${
      !installer
        ? `<div class="card card-pad">${ctx.sectionTitle("Team on the move", "Assigned installer workload")}${ctx.state.users
            .filter((u) => u.role === "installer")
            .map((u) => {
              const count = ctx.state.jobs.filter(
                (j) => j.installerId === u.id && j.status !== "Completed",
              ).length;
              return `<div class="list-row"><span class="avatar">${u.avatar}</span><div class="grow"><div class="list-title">${ctx.esc(u.name)}</div><div class="list-sub">${count} active jobs · ${u.status}</div></div>${ctx.badge(count ? "Assigned" : "Available")}</div>`;
            })
            .join("")}</div>`
        : ""
    }</div></div>`;
  }

  function renderInstallationProof(j) {
    const files = (j.installationProof || []).filter(
        (p) => !ctx.isInstaller() || p.userId === ctx.currentUser().id,
      ),
      ready = ctx.hasInstallationProof(j),
      allowed = ctx.canUploadInstallationProof(j),
      busy = ctx.proofUploadBusy && ctx.ui.proofUploadJob === j.id;
    return `<section class="card card-pad mt16"><div class="row wrap gap8"><h3>Work evidence · photos / videos</h3>${ctx.badge(ready ? "Evidence complete" : "Evidence required")}</div><p class="small muted">At the client site, upload at least one photo or video of the finished work. Your device location, accuracy and upload time are saved with each attachment. Allow location access when prompted.</p>${(j.installationProof || []).some((p) => p.pendingLocation && p.userId === ctx.currentUser()?.id) ? `<button class="btn secondary mt12" data-action="retry-proof-location" data-id="${ctx.attr(j.id)}">Retry evidence location</button>` : ""}${ctx.canUploadInstallationProof(j, "before") ? `<label class="btn secondary mt12">Upload before photos / videos<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" multiple data-install-proof="${ctx.attr(j.id)}" data-proof-phase="before" hidden></label>` : ""}${allowed ? `<div class="row wrap gap8"><label class="btn ${busy ? "secondary" : ""}">${ctx.icon("camera")} ${busy ? "Saving evidence…" : "Upload photos / videos"}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" multiple data-install-proof="${ctx.attr(j.id)}" hidden ${busy ? "disabled" : ""}></label><label class="btn secondary">Take photo<input type="file" accept="image/*" capture="environment" data-install-proof="${ctx.attr(j.id)}" hidden ${busy ? "disabled" : ""}></label><label class="btn secondary">Record video<input type="file" accept="video/*" capture="environment" data-install-proof="${ctx.attr(j.id)}" hidden ${busy ? "disabled" : ""}></label></div>` : `<p class="small muted">${ctx.isInstaller() ? "Evidence upload opens when installation is in progress." : "The assigned installer uploads evidence from their account."}</p>`}${ctx.ui.proofMessageJob === j.id && ctx.ui.proofMessage ? `<div class="form-note mt12" role="status">${ctx.esc(ctx.ui.proofMessage)}</div>` : ""}<p class="small muted">Photos: up to 10 MB each. Videos: up to 25 MB each. Evidence is saved with the job and must remain available for review.</p><div class="photo-grid mt16">${files.map((p) => `<article class="photo-card"><div style="background:var(--canvas)">${ctx.proofAvailability.get(p.blobId) === true ? (p.kind === "video" ? `<video data-proof-media="${ctx.attr(p.blobId)}" controls playsinline preload="metadata" style="width:100%;max-height:280px"></video>` : `<img data-proof-media="${ctx.attr(p.blobId)}" alt="Installed product photo" style="width:100%;max-height:280px;object-fit:contain">`) : `<p class="small muted" style="padding:20px">${ctx.proofAvailability.get(p.blobId) === false ? "Saved media is unavailable. Check storage access or upload it again." : "Checking saved media…"}</p>`}</div><div style="padding:14px;overflow-wrap:anywhere"><strong>${ctx.esc(p.name)}</strong><div class="small muted">${p.kind === "video" ? "Video" : "Photo"} · ${ctx.fmt(p.createdAt, true)}</div>${ctx.validProofLocation(p.location) ? `<p class="small">Device location: ${p.location.latitude.toFixed(6)}, ${p.location.longitude.toFixed(6)}<br>Accuracy: ±${Math.round(p.location.accuracy)} m · ${ctx.fmt(p.location.capturedAt, true)}</p><a class="link-btn small" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.location.latitude + "," + p.location.longitude)}" target="_blank" rel="noopener">View captured location</a>` : '<p class="small">No valid device location.</p>'}</div></article>`).join("") || '<p class="small muted">No installation evidence uploaded yet.</p>'}</div></section>`;
  }

  function renderOverlays() {
    if (ctx.isInstaller()) {
      if (
        ctx.ui.modal &&
        (ctx.ui.modal.type !== "job" ||
          !ctx.canViewJob(ctx.jobOf(ctx.ui.modal.id)))
      )
        ctx.ui.modal = null;
      ctx.ui.child = null;
    }
    let out = "";
    if (ctx.ui.drawer === "notifications") out += ctx.renderNotifications();
    if (ctx.ui.drawer === "search") out += ctx.renderSearch();
    if (ctx.ui.modal) {
      const m = ctx.ui.modal;
      if (
        m.type === "businessReport" &&
        ctx.ui.reportResult &&
        ctx.allowedPage("reports")
      )
        out += ctx.modalFrame(
          ctx.ui.reportResult.title,
          "Generated report",
          ctx.reportDocument(ctx.ui.reportResult),
          "full",
        );
      if (["newPO", "viewPO", "supplier"].includes(m.type))
        out += ctx.renderProcurementModal(m);
      if (m.type === "settlement") out += ctx.renderSettlementDocument(m.id);
      if (m.type === "lead") out += ctx.renderLeadWorkspace(m.id);
      if (m.type === "job") out += ctx.renderJobDetail(m.id);
      if (m.type === "editJob" && ctx.canManageJobDetails())
        out += ctx.renderEditJob(m.id);
      if (m.type === "newLead") out += ctx.renderNewLead();
      if (m.type === "newTask") out += ctx.renderNewTask();
      if (m.type === "stock") out += ctx.renderStockModal(m.id);
      if (m.type === "invoice") out += ctx.renderInvoiceModal();
      if (m.type === "payment") out += ctx.renderPaymentModal(m.id);
      if (m.type === "newUser") out += ctx.renderNewUser();
      if (m.type === "editUser") out += ctx.renderEditUser(m.id);
      if (m.type === "changePassword") out += ctx.renderChangePassword(m.id);
      if (m.type === "deleteUser") out += ctx.renderDeleteUser(m.id);
    }
    if (ctx.ui.child) {
      const c = ctx.ui.child;
      if (c.type === "copyText") out += ctx.renderCopyText(c.text);
      if (c.type === "sendQuote") out += ctx.renderSendQuote(c.id);
      if (c.type === "previewQuote") out += ctx.renderQuotePreview(c.id);
    }
    return out;
  }

  function renderNotifications() {
    return `<div class="backdrop drawer-backdrop" data-backdrop="close-drawer"><section class="modal drawer"><header class="modal-head"><div><h2>Activity inbox</h2><p>Live operational alerts</p></div><button class="modal-close" data-action="close-drawer">${ctx.icon("x")}</button></header><div class="modal-body" style="padding:8px">${ctx
      .visibleNotifications()
      .map(
        (n) =>
          `<button class="search-result" style="width:100%;border:0;text-align:left;background:${ctx.stockAlertRead(n) ? "transparent" : "#f1f6ff"}" data-action="open-notification" data-id="${n.id}"><span class="dot" style="color:${ctx.stockAlertRead(n) ? "#cfd9e7" : "var(--blue)"}"></span><span class="grow"><strong>${ctx.esc(n.title)}</strong><span class="detail" style="display:block">${ctx.esc(n.body)}</span><small class="muted">${ctx.fmt(n.createdAt, true)}</small></span></button>`,
      )
      .join("")}</div></section></div>`;
  }

  function renderSearch() {
    const results = ctx.globalResults();
    return `<div class="backdrop" style="place-items:start center" data-backdrop="close-drawer"><section class="modal search-modal"><div class="search-box">${ctx.icon("search")}<input class="input" autofocus placeholder="Search jobs, leads, tasks, invoices or products" value="${ctx.attr(ctx.ui.globalSearch || "")}" data-filter="globalSearch" data-focus="global-search"><button class="modal-close" data-action="close-drawer">${ctx.icon("x")}</button></div><div class="modal-body" style="padding:10px">${!(ctx.ui.globalSearch || "").trim() ? `<div class="empty">${ctx.icon("search", "lg")}<h3>Search the operations workspace</h3><p>Find a client, job, task, invoice, SKU or barcode.</p></div>` : !results.length ? `<div class="empty"><h3>No matching records</h3><p>Try a job number, customer name, suburb, invoice or SKU.</p></div>` : results.map((r) => `<button class="search-result" style="width:100%;border:0;text-align:left;background:transparent" ${r.action ? `data-action="${r.action}" data-id="${ctx.attr(r.id)}"` : `data-page="${r.page}"`}><span class="icon-box">${ctx.icon(r.icon)}</span><span class="grow"><strong>${ctx.esc(r.title)}</strong><span class="detail" style="display:block">${ctx.esc(r.sub)}</span></span>${ctx.icon("arrow")}</button>`).join("")}</div></section></div>`;
  }
  return {
    renderLogin,
    renderShell,
    renderMobileTabs,
    renderMobileMenu,
    renderPage,
    renderDashboard,
    renderInstallationProof,
    renderOverlays,
    renderNotifications,
    renderSearch,
  };
}
