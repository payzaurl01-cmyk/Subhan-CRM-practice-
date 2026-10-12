/** Preserved prototype views/finance. Live services will replace browser mutations in runtime.js. */
export function createFinance(ctx) {
  function renderJobFinancials(j) {
    if (ctx.isInstaller() || !ctx.hasCapability("billing_manage")) return "";
    const a = ctx.finalJobAmounts(j);
    return `<section class="card card-pad mt16" data-final-billing><h3>Final job billing</h3><p class="small muted">${ctx.esc(j.finalBillingStatus || "Provisional until the job is completed")} · ${ctx.esc(j.billingBasis.source)}</p><div class="facts">${ctx.infoFact("Original agreed total", ctx.money(a.baseTotal))}${ctx.infoFact("Collected additions", ctx.money(a.added))}${ctx.infoFact("Processed return credits", ctx.money(a.credited))}${ctx.infoFact("Final job total", ctx.money(a.total))}${ctx.infoFact("Balance", ctx.money(j.outstanding || 0))}${ctx.infoFact("Refund / credit due", ctx.money(j.refundDue || 0))}</div><p class="small muted">Amounts include tax. Existing service charges remain in the agreed total. Existing invoices and payments are retained; final adjustments are posted separately.</p>${a.needsReview ? '<div class="form-note">Confirm the original agreed total and product values before final billing.</div>' : ""}<details class="mt12"><summary class="link-btn">Confirm / correct original billing basis</summary><div class="field mt12"><label>Original agreed total, including tax and services</label><input class="input" type="number" min="0" step="0.01" id="billing-base-total" value="${a.baseTotal}"></div>${j.items.map((x) => `<div class="field mt12"><label>${ctx.esc(x.name)} · original unit value including tax</label><input class="input" type="number" min="0" step="0.01" data-original-price="${x.id}" value="${j.billingBasis.lines.find((v) => v.itemId === x.id)?.unitGross ?? ""}"></div>`).join("")}<textarea class="textarea mt12" id="billing-basis-reason" placeholder="Reason / source for confirmed pricing"></textarea><button class="btn secondary mt12" data-action="save-billing-basis" data-id="${j.id}">Confirm billing basis</button></details>${j.status === "Completed" ? `<button class="btn mt12" data-action="finalize-job-billing" data-id="${j.id}">Reconcile final invoice</button>` : ""}${(j.finalSettlements || []).map((v, i) => `<div class="list-row"><div class="grow"><strong>Final billing revision ${i + 1}</strong><div class="list-sub">${ctx.fmt(v.at, true)} · Final ${ctx.money(v.amounts.total)} · Adjustment ${ctx.money(v.adjustment)}</div></div>${v.documentId ? `<button class="btn ghost sm" data-action="view-settlement" data-id="${v.documentId}">View document</button>` : ""}</div>`).join("")}</section>`;
  }

  function renderSettlementDocument(id) {
    const i = ctx.state.invoices.find((i) => i.id === id);
    if (
      !i?.snapshot ||
      ctx.isInstaller() ||
      !ctx.hasCapability("billing_manage")
    )
      return "";
    const a = i.snapshot;
    return ctx.modalFrame(
      i.number,
      `${i.customer} · ${i.type} · Recorded ${ctx.fmt(i.issueDate)}`,
      `<div class="facts">${ctx.infoFact("Original agreement", ctx.money(a.baseTotal))}${ctx.infoFact("Added products", ctx.money(a.added))}${ctx.infoFact("Returned product credits", ctx.money(a.credited))}${ctx.infoFact("Final contract total", ctx.money(a.total))}${ctx.infoFact("This adjustment", ctx.money(i.total))}</div><h4 class="mt16">Collected additions</h4>${a.additions.map((x) => `<p>${ctx.esc(x.sku)} · ${x.quantity} × ${ctx.money(x.unitGross)} = ${ctx.money(x.amount)}</p>`).join("") || '<p class="small muted">None</p>'}<h4 class="mt16">Processed return credits</h4>${a.credits.map((x) => `<p>${ctx.esc(x.number)} · ${ctx.esc(x.sku || x.itemId)} · ${x.quantity} × ${ctx.money(x.unitGross)} = ${ctx.money(x.amount)}</p>`).join("") || '<p class="small muted">None</p>'}<p class="form-note">This document preserves the amounts recorded at finalization. Payments are retained in the payment ledger. A credit or refund due is recorded; no payment is automatically refunded.</p>`,
      "wide",
    );
  }

  function renderEmailSettingsPage() {
    if (!ctx.canConfigureEmail())
      return '<div class="empty">Email settings are unavailable.</div>';
    return (
      ctx.header(
        "MANAGEMENT",
        "Email Configuration",
        "Manage sender addresses, supplier PO defaults, SMTP, Resend and email preferences.",
      ) +
      ctx.renderEmailConfig() +
      `<div class="card card-pad mt16"><h3>Recent PO email activity</h3>${
        ctx.state.purchaseOrders
          .filter((p) => p.lastEmail)
          .map(
            (p) =>
              `<p>${ctx.esc(p.number)} · ${ctx.esc(p.lastEmail.to)} · ${ctx.fmt(p.lastEmail.sentAt, true)} · Accepted by email service</p>`,
          )
          .join("") || '<p class="muted">No confirmed email activity yet.</p>'
      }</div>`
    );
  }

  function renderCopyText(text) {
    return ctx.modalFrame(
      "Copy document content",
      "Select the text and press Ctrl+C or Cmd+C.",
      `<textarea class="input" readonly rows="20" style="width:100%">${ctx.esc(text)}</textarea>`,
      "wide",
      "close-child",
    );
  }

  function renderEmailConfig() {
    const c = ctx.state.emailConfig || {};
    const input = (label, name, type = "text", fallback = "") =>
      `<div class="field"><label>${label}</label><input class="input" type="${type}" name="${name}" value="${ctx.attr(c[name] || fallback)}"></div>`;
    return `<div class="card card-pad" style="grid-column:1/-1"><h3>Email Configuration</h3><p class="muted">Shared settings for Managers, Admins and Super Admins.</p><form id="email-config-form" onsubmit="return false"><div class="form-grid">${input("Sender name", "fromName", "text", "Interior Blinds & Shutters")}${input("Default transactional sender email", "fromEmail", "email")}${input("Default email to send supplier POs", "poFromEmail", "email")}${input("Invoice sender email (optional override)", "invoiceFromEmail", "email")}${input("Return order sender email (optional override)", "returnFromEmail", "email")}${input("Quote sender email (optional override)", "quoteFromEmail", "email")}${input("Reply-to email", "replyTo", "email")}${input("Internal notifications email", "notificationEmail", "email")}</div><h4 class="mt16">Resend transactional email</h4><div class="form-grid">${input("Secure CRM email service URL", "serviceUrl", "url")}${input("Resend API key secret name (on server)", "resendSecretName", "text", "RESEND_API_KEY")}</div><p class="small muted">Not connected until your secure email service is deployed. Set the Resend API key on the server and verify your sender domain. Email drafts cannot enforce a From address.</p><h4 class="mt16">Email defaults</h4><div class="form-grid">${input("Default CC (comma-separated)", "cc")}${input("Default BCC (comma-separated)", "bcc")}${input("PO email subject prefix", "poSubjectPrefix", "text", "Purchase Order")}${input("Invoice email subject prefix", "invoiceSubjectPrefix", "text", "Invoice")}${input("Quote email subject prefix", "quoteSubjectPrefix", "text", "Quotation")}${input("Return email subject prefix", "returnSubjectPrefix", "text", "Return Order")}</div><div class="field mt12"><label>Email signature</label><textarea class="input" name="signature">${ctx.esc(c.signature || "")}</textarea></div><h4 class="mt16">SMTP</h4><div class="form-grid">${input("SMTP host", "smtpHost", "text", "smtp.resend.com")}${input("SMTP port", "smtpPort", "number", "465")}${input("SMTP username", "smtpUser", "text", "resend")}<div class="field"><label>SMTP security</label><select class="select" name="smtpSecurity"><option value="TLS" ${c.smtpSecurity !== "STARTTLS" ? "selected" : ""}>TLS</option><option value="STARTTLS" ${c.smtpSecurity === "STARTTLS" ? "selected" : ""}>STARTTLS</option></select></div>${input("SMTP password secret name (on server)", "smtpSecretName", "text", "RESEND_API_KEY")}</div><p class="small muted">Credentials stay on the server. This standalone file stores configuration preferences in this browser.</p><button class="btn mt16" data-action="save-email-config">Save Email Configuration</button></form></div>`;
  }

  function renderBilling() {
    const outstanding = ctx.workInvoices().reduce((s, x) => s + x.balance, 0),
      overdue = ctx
        .workInvoices()
        .filter((x) => x.status === "Overdue")
        .reduce((s, x) => s + x.balance, 0),
      paid = ctx.workPayments().reduce((s, x) => s + x.amount, 0);
    let panel = "";
    if (ctx.ui.billingTab === "Invoices")
      panel = `<div class="card"><div class="table-wrap desktop-table"><table class="data-table"><thead><tr><th>Invoice</th><th>Job</th><th>Type</th><th>Due</th><th>Total</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>${ctx
        .workInvoices()
        .map((i) => {
          const j = ctx.jobOf(i.jobId);
          return `<tr><td><strong>${i.number}</strong><div class="secondary-line">${ctx.esc(i.customer)}</div></td><td>${j?.number || "—"}</td><td>${i.type}</td><td>${ctx.fmt(i.dueDate)}</td><td class="strong">${ctx.money(i.total)}</td><td class="strong">${ctx.money(i.balance)}</td><td>${ctx.badge(i.status)}</td><td><div class="table-actions">${i.snapshot ? `<button class="btn ghost sm" data-action="view-settlement" data-id="${i.id}">Details</button>` : ""}${i.balance > 0 ? `<button class="btn secondary sm icon-only" data-action="record-payment" data-id="${i.id}" title="Record payment">${ctx.icon("plus", "sm")}</button><button class="btn ghost sm icon-only" data-action="send-reminder" data-id="${i.id}" title="Send reminder">${ctx.icon("mail", "sm")}</button>` : ""}</div></td></tr>`;
        })
        .join("")}</tbody></table></div><div class="cards-mobile">${ctx
        .workInvoices()
        .map(
          (i) =>
            `<div class="mobile-card"><div class="job-top"><div><strong>${i.number}</strong><div class="secondary-line">${ctx.esc(i.customer)} · ${ctx.jobOf(i.jobId)?.number || ""}</div></div>${ctx.badge(i.status)}</div><div class="facts mt12">${ctx.infoFact("Total", ctx.money(i.total))}${ctx.infoFact("Balance", ctx.money(i.balance))}${ctx.infoFact("Due", ctx.fmt(i.dueDate))}</div>${i.balance > 0 ? `<div class="job-actions"><button class="btn secondary sm" data-action="record-payment" data-id="${i.id}">Payment</button><button class="btn ghost sm" data-action="send-reminder" data-id="${i.id}">Reminder</button></div>` : ""}</div>`,
        )
        .join("")}</div></div>`;
    if (ctx.ui.billingTab === "Payments")
      panel = `<div class="card card-pad">${ctx.sectionTitle("Payment ledger", "Payments are recorded, allocated and never silently deleted.")}${ctx
        .workPayments()
        .map(
          (p) =>
            `<div class="list-row"><span class="icon-box green">${ctx.icon("check")}</span><div class="grow"><div class="list-title">${p.number} · ${ctx.esc(p.customer)}</div><div class="list-sub">${ctx.workInvoices().find((i) => i.id === p.invoiceId)?.number || ""} · ${p.method} · ${ctx.esc(p.reference)}</div></div><div class="right"><strong>${ctx.money(p.amount)}</strong><div class="secondary-line">${ctx.fmt(p.date)}</div></div></div>`,
        )
        .join("")}</div>`;
    if (ctx.ui.billingTab === "Client Chase")
      panel = `<div class="job-grid">${ctx
        .workInvoices()
        .filter((i) => i.balance > 0)
        .map((i) => {
          const days = Math.max(
              0,
              Math.ceil(
                (Date.now() - new Date(i.dueDate).getTime()) / 86400000,
              ),
            ),
            activities = ctx.state.chaseActivities.filter(
              (x) => x.invoiceId === i.id,
            );
          return `<div class="card card-pad"><div class="job-top"><div><div class="eyebrow">${i.number}</div><h3 style="margin:5px 0">${ctx.esc(i.customer)}</h3></div>${ctx.badge(i.status)}</div><div style="font-size:28px;font-weight:900;margin:14px 0">${ctx.money(i.balance)}</div><div class="facts">${ctx.infoFact("Due date", ctx.fmt(i.dueDate))}${ctx.infoFact("Days overdue", String(days))}${ctx.infoFact("Reminders", String(i.reminderCount))}</div><div class="form-note mt12">${ctx.icon("refresh", "sm")} ${ctx.esc(activities[0]?.note || "No chase activity yet.")}</div><div class="job-actions"><button class="btn sm" data-action="send-reminder" data-id="${i.id}">${ctx.icon("mail", "sm")} Send reminder</button><button class="btn secondary sm" data-action="record-payment" data-id="${i.id}">Record payment</button></div></div>`;
        })
        .join("")}</div>`;
    return `${ctx.header("JOB TO CASH", "Billing that stays connected to the job.", "Invoices, payment allocations and client chasing share one timeline and one outstanding balance.", `<button class="btn" data-action="new-invoice">${ctx.icon("plus")} Create invoice</button>`)}<div class="metric-grid" style="grid-template-columns:repeat(3,1fr)">${ctx.metric("Outstanding", ctx.money(outstanding), "Across open invoices", "receipt", "amber")}${ctx.metric("Overdue", ctx.money(overdue), `${ctx.workInvoices().filter((i) => i.status === "Overdue").length} clients require chasing`, "bell", "red")}${ctx.metric("Payments received", ctx.money(paid), "Recorded in the demo ledger", "check", "green")}</div><div class="card card-pad"><div class="tabs">${["Invoices", "Payments", "Client Chase"].map((t) => `<button class="tab ${ctx.ui.billingTab === t ? "active" : ""}" data-action="billing-tab" data-tab="${t}">${t}</button>`).join("")}</div></div><div class="mt16">${panel}</div>${ctx.state.jobs
      .filter(
        (j) =>
          ctx.inWorkJob(j.id) &&
          (j.finalSettlements?.length || j.finalBillingStatus),
      )
      .map(
        (j) =>
          `<div class="card card-pad mt16"><strong>${ctx.esc(j.number)} · ${ctx.esc(j.finalBillingStatus || "Provisional")}</strong><p class="small">Balance ${ctx.money(j.outstanding || 0)} · Refund / credit due ${ctx.money(j.refundDue || 0)}</p><button class="btn ghost sm" data-action="open-job" data-id="${j.id}">Review final job billing</button></div>`,
      )
      .join("")}`;
  }

  function renderReports() {
    const f = ctx.ui.reportFilters || { type: "jobs" };
    return `${ctx.header("BUSINESS REPORTS", "Create a report.", "Filter operational records, review results, print, copy or export CSV.")}<div class="card card-pad"><form id="business-report-form" onsubmit="return false"><div class="form-grid"><div class="field"><label>Report type</label><select class="select" name="type" data-report-type>${Object.entries(
      ctx.REPORT_TYPES,
    )
      .map(
        ([k, v]) =>
          `<option value="${k}" ${f.type === k ? "selected" : ""}>${ctx.esc(v)}</option>`,
      )
      .join(
        "",
      )}</select></div><div class="field"><label>Client</label><select class="select" name="clientKey" data-report-client ${ctx.CLIENT_REPORT_TYPES.includes(f.type) ? "" : "disabled"}><option value="">All clients</option>${ctx
      .reportClients()
      .map(
        (c) =>
          `<option value="${ctx.attr(c.key)}" ${f.clientKey === c.key ? "selected" : ""}>${ctx.esc(c.name)}${c.email ? ` · ${ctx.esc(c.email)}` : ""}</option>`,
      )
      .join(
        "",
      )}</select><p class="small muted">Available for client-related reports.</p></div><div class="field"><label>From date</label><input class="input" type="date" name="from" value="${ctx.attr(f.from || "")}"></div><div class="field"><label>To date</label><input class="input" type="date" name="to" value="${ctx.attr(f.to || "")}"></div><div class="field"><label>Job (for job-linked reports)</label><select class="select" name="jobId"><option value="">All jobs</option>${ctx.state.jobs
      .filter(ctx.canViewJob)
      .map(
        (x) =>
          `<option value="${ctx.attr(x.id)}" ${f.jobId === x.id ? "selected" : ""}>${ctx.esc(x.number)} · ${ctx.esc(x.customer)}</option>`,
      )
      .join(
        "",
      )}</select></div><div class="field"><label>Employee (for assigned / recorded work)</label><select class="select" name="employeeId"><option value="">All employees</option>${ctx.state.users
      .filter((x) => x.role !== "super_admin" || ctx.isMasterSession())
      .map(
        (x) =>
          `<option value="${ctx.attr(x.id)}" ${f.employeeId === x.id ? "selected" : ""}>${ctx.esc(x.name)}</option>`,
      )
      .join(
        "",
      )}</select></div><div class="field"><label>Status / stage contains</label><input class="input" name="status" placeholder="e.g. Completed, Accepted, Overdue" value="${ctx.attr(f.status || "")}"></div></div><button class="btn mt16" data-action="generate-report">Generate Report</button></form><p class="small muted">Inventory is a current snapshot. Use the notes on each generated report to check its date and filter basis.</p></div>${ctx.ui.reportResult ? `<div class="row wrap gap8 mt16"><button class="btn" data-action="preview-report">Print / Copy Report</button><button class="btn ghost" data-action="export-report">Export CSV</button></div><div class="card card-pad mt16">${ctx.reportDocument(ctx.ui.reportResult)}</div>` : '<div class="card card-pad mt16"><p>Select a report type and click Generate Report.</p></div>'}`;
  }

  function renderInvoiceModal() {
    return ctx.modalFrame(
      "Create invoice",
      "Create a deposit, progress, final or standard invoice from a Job Order.",
      `<form class="form-stack" id="invoice-form"><div class="field"><label>Job Order</label><select class="select" name="jobId">${ctx.state.jobs.map((j) => `<option value="${j.id}">${j.number} · ${ctx.esc(j.customer)}</option>`).join("")}</select></div><div class="field"><label>Invoice type</label><select class="select" name="type">${["Deposit", "Progress", "Final", "Standard"].map((x) => `<option>${x}</option>`).join("")}</select></div><div class="field"><label>Invoice total (AUD)</label><input class="input" type="number" step="0.01" name="total" value="1000"></div></form>`,
      "",
      "close-modal",
      `<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="create-invoice">Create draft</button>`,
    );
  }

  function renderPaymentModal(id) {
    const i = ctx.state.invoices.find((x) => x.id === id);
    if (!i) return "";
    return ctx.modalFrame(
      "Record payment",
      `${i.number} · ${i.customer}`,
      `<div class="facts">${ctx.infoFact("Invoice total", ctx.money(i.total))}${ctx.infoFact("Current balance", ctx.money(i.balance))}</div><form class="form-stack mt16" id="payment-form"><div class="field"><label>Amount received (AUD)</label><input class="input" type="number" step="0.01" min="0" max="${i.balance}" name="amount" value="${Math.max(1, i.balance)}"></div><div class="field"><label>Payment method</label><select class="select" name="method">${["Bank transfer", "Cash", "Card", "EFTPOS", "Cheque"].map((x) => `<option>${x}</option>`).join("")}</select></div></form>`,
      "",
      "close-modal",
      `<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="save-payment" data-id="${i.id}">${ctx.icon("check")} Record payment</button>`,
    );
  }
  return {
    renderJobFinancials,
    renderSettlementDocument,
    renderEmailSettingsPage,
    renderCopyText,
    renderEmailConfig,
    renderBilling,
    renderReports,
    renderInvoiceModal,
    renderPaymentModal,
  };
}
