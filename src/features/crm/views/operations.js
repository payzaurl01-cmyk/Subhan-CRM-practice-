/** Preserved prototype views/operations. Live services will replace browser mutations in runtime.js. */
import { applicableTask } from "../job-workflow.js";
export function createOperations(ctx) {
  function renderLeads() {
    const closed = (l) => l.stage === "Won" || l.stage === "Lost",
      q = ctx.ui.leadSearch.trim().toLowerCase();
    const filtered = ctx.state.leads.filter(
      (l) =>
        (!ctx.ui.workLeadId || ctx.ui.workLeadId === l.id) &&
        (!q ||
          `${l.number} ${l.customer} ${l.phone} ${l.email} ${l.suburb} ${l.service} ${l.source}`
            .toLowerCase()
            .includes(q)) &&
        (ctx.ui.leadStatus === "All" ||
          (ctx.ui.leadStatus === "Open" ? !closed(l) : closed(l))) &&
        (ctx.ui.leadStage === "All" || l.stage === ctx.ui.leadStage) &&
        (ctx.ui.leadPriority === "All" || l.priority === ctx.ui.leadPriority),
    );
    const pipeline = ctx.state.leads
      .filter((l) => !closed(l))
      .reduce((s, l) => s + l.value, 0);
    const actions = `<button class="btn" data-action="new-lead">${ctx.icon("plus")} New lead</button>`;
    const toolbar = `<div class="card toolbar"><select class="select" data-filter="leadStatus"><option ${ctx.ui.leadStatus === "Open" ? "selected" : ""}>Open</option><option ${ctx.ui.leadStatus === "All" ? "selected" : ""}>All</option><option ${ctx.ui.leadStatus === "Closed" ? "selected" : ""}>Closed</option></select><select class="select" data-filter="leadStage"><option value="All">All stages</option>${ctx.leadStages.map((s) => `<option ${ctx.ui.leadStage === s ? "selected" : ""}>${s}</option>`).join("")}</select><select class="select" data-filter="leadPriority"><option value="All">All priorities</option>${["Low", "Normal", "High", "Urgent"].map((s) => `<option ${ctx.ui.leadPriority === s ? "selected" : ""}>${s}</option>`).join("")}</select><input class="input" placeholder="Search..." value="${ctx.attr(ctx.ui.leadSearch)}" data-filter="leadSearch" data-focus="lead-search"><span class="result-count">${filtered.length} result${filtered.length === 1 ? "" : "s"}</span></div>`;
    const rows = filtered
      .map((l) => {
        const quotes = ctx.state.quotes.filter((q) => q.leadId === l.id).length;
        return `<tr class="clickable" data-action="open-lead" data-id="${l.id}"><td class="primary-cell">${ctx.esc(l.number)}</td><td><strong>${ctx.esc(l.customer)}</strong><div class="secondary-line">${ctx.esc(l.suburb)}</div></td><td>${ctx.esc(l.service)}</td><td class="muted">${ctx.esc(l.source)}</td><td>${ctx.badge(l.stage)}</td><td>${ctx.badge(l.priority)}</td><td class="strong">${ctx.money(l.value)}</td><td>${ctx.esc(ctx.userName(l.assignedTo))}</td><td>${ctx.fmt(l.createdAt)}</td></tr>`;
      })
      .join("");
    const mobile = filtered
      .map(
        (l) =>
          `<div class="mobile-card" data-action="open-lead" data-id="${l.id}"><div class="row gap10"><span class="avatar">${ctx.initials(l.customer)}</span><div class="grow"><div class="strong">${ctx.esc(l.customer)}</div><div class="secondary-line">${ctx.esc(l.number)} · ${ctx.esc(l.suburb)}</div></div>${ctx.badge(l.priority)}</div><div class="row wrap gap6 mt12">${ctx.badge(l.stage)}${ctx.badge(l.service)}${ctx.badge(ctx.money(l.value))}</div><div class="row mt12" style="justify-content:space-between;color:var(--blue);font-weight:800"><span>Open lead and write quotation</span>${ctx.icon("arrow")}</div></div>`,
      )
      .join("");
    return `${ctx.header("SALES INTAKE", "Leads", `${ctx.state.leads.length} leads · ${ctx.money(pipeline)} pipeline`, actions)}${toolbar}<div class="card"><div class="table-wrap desktop-table"><table class="data-table"><thead><tr><th>#</th><th>Customer</th><th>Service</th><th>Source</th><th>Stage</th><th>Priority</th><th>Value</th><th>Assigned</th><th>Created</th></tr></thead><tbody>${rows || `<tr><td colspan="9"><div class="empty">No leads match the selected filters.</div></td></tr>`}</tbody></table></div><div class="cards-mobile">${mobile || `<div class="empty">No leads match the selected filters.</div>`}</div></div>`;
  }

  function renderLeadWorkspace(id) {
    const lead = ctx.leadOf(id);
    if (!lead) return "";
    if (!ctx.ui.quoteDraft || ctx.ui.quoteDraft.leadId !== id)
      ctx.ui.quoteDraft = { leadId: id, ...ctx.blankDraft(lead) };
    const d = ctx.ui.quoteDraft,
      t = ctx.quoteTotals(d),
      leadQuotes = ctx.state.quotes.filter((q) => q.leadId === id),
      leadJobs = ctx.state.jobs.filter((j) => j.leadId === id),
      leadTasks = ctx.state.tasks.filter(
        (x) =>
          x.leadId === id ||
          (x.jobId && leadJobs.some((j) => j.id === x.jobId)),
      );
    const products = ctx.state.products
      .map(
        (p) =>
          `<div class="product-card"><span class="icon-box">${ctx.icon("box")}</span><h4>${ctx.esc(p.name)}</h4><div class="meta">${ctx.esc(p.sku)} · Available ${Math.max(0, p.onHand - p.reserved)}</div><div class="price">${ctx.money(p.salePrice)}</div><button class="btn sm" data-action="add-quote-product" data-id="${p.id}">${ctx.icon("plus", "sm")} Add</button></div>`,
      )
      .join("");
    const lines = d.lines.length
      ? d.lines
          .map(
            (x) =>
              `<div class="quote-line"><span class="icon-box" style="width:34px;height:34px">${ctx.icon(x.kind === "Inventory" ? "box" : "settings", "sm")}</span><div><div class="line-name">${ctx.esc(x.description)}</div><div class="line-meta">${ctx.esc(x.kind)}${x.sku ? ` · ${ctx.esc(x.sku)}` : ""}</div></div><input class="input qty" type="number" min="0" value="${x.quantity}" data-line-field="quantity" data-id="${x.localId}" data-focus="line-${x.localId}-qty" title="Quantity"><input class="input unit" type="number" min="0" step="0.01" value="${x.unitPrice}" data-line-field="unitPrice" data-id="${x.localId}" data-focus="line-${x.localId}-price" title="Unit price"><strong class="line-total">${ctx.money(x.quantity * x.unitPrice)}</strong><button class="btn danger sm icon-only" data-action="remove-quote-line" data-id="${x.localId}" title="Remove">${ctx.icon("trash", "sm")}</button></div>`,
          )
          .join("")
      : `<div class="empty" style="padding:24px">No items added yet. Select an inventory product or add a custom service line.</div>`;
    const history = leadQuotes.length
      ? leadQuotes.map((q) => ctx.renderQuoteCard(q, lead)).join("")
      : `<div class="empty">No quotations have been created for this lead.</div>`;
    return ctx.modalFrame(
      `${lead.number} · ${lead.customer}`,
      "Lead information, quotation writing, sending, job linkage and follow-up tasks.",
      `<div class="lead-summary"><div class="card card-pad"><div class="contact-hero"><span class="avatar">${ctx.initials(lead.customer)}</span><div><h3>${ctx.esc(lead.customer)}</h3><p>${ctx.esc(lead.email || "No email added")} · ${ctx.esc(lead.phone)}</p></div></div>${ctx.sectionTitle("Lead information", "The quotation recipient defaults to the lead email.")}<div class="facts">${ctx.infoFact("Customer", lead.customer)}${ctx.infoFact("Phone", lead.phone)}${ctx.infoFact("Email", lead.email || "No email added")}${ctx.infoFact("Location", `${lead.suburb} ${lead.postcode}`)}${ctx.infoFact("Service", lead.service)}${ctx.infoFact("Source", lead.source)}${ctx.infoFact("Assigned to", ctx.userName(lead.assignedTo))}${ctx.infoFact("Estimated value", ctx.money(lead.value))}</div><div class="row wrap gap8 mt16">${ctx.badge(lead.stage)}${ctx.badge(lead.priority)}<span class="small muted">Next follow-up: ${ctx.fmt(lead.nextFollowUp, true)}</span></div></div><div class="card card-pad">${ctx.sectionTitle("Write quotation", "Add products from inventory and custom lines such as installation, labour or service charges.")}<div class="eyebrow" style="color:var(--sub)">Add products from inventory</div><div class="product-rail mt12">${products}</div><div class="custom-line-box"><div class="eyebrow" style="color:var(--sub);margin-bottom:12px">Add custom line</div><div class="form-grid"><div class="field" style="grid-column:1/-1"><label>Description</label><input class="input" value="${ctx.attr(d.customDescription)}" data-draft-field="customDescription" data-focus="custom-desc"></div><div class="field"><label>Quantity</label><input class="input" type="number" value="${ctx.attr(d.customQuantity)}" data-draft-field="customQuantity" data-focus="custom-qty"></div><div class="field"><label>Unit price (AUD)</label><input class="input" type="number" step="0.01" value="${ctx.attr(d.customPrice)}" data-draft-field="customPrice" data-focus="custom-price"></div></div><button class="btn secondary mt12" data-action="add-custom-line">${ctx.icon("plus")} Add custom line</button></div><div class="quote-lines"><div class="eyebrow" style="color:var(--sub)">Quotation lines</div>${lines}</div><div class="form-grid mt16"><div class="form-stack"><div class="field"><label>Valid until</label><input class="input" type="date" value="${ctx.attr(d.validUntil)}" data-draft-field="validUntil" data-focus="quote-valid"></div><div class="field"><label>Customer notes</label><textarea class="textarea" data-draft-field="notes" data-focus="quote-notes">${ctx.esc(d.notes)}</textarea></div></div><div class="quote-totals"><div class="total-row"><span>Subtotal</span><strong>${ctx.money(t.subtotal)}</strong></div><div class="total-row"><span>GST (10%)</span><strong>${ctx.money(t.gst)}</strong></div><div class="total-row grand"><span>Quotation total</span><strong>${ctx.money(t.total)}</strong></div><button class="btn" style="width:100%;margin-top:12px" data-action="save-quote" ${d.lines.length ? "" : "disabled"}>${ctx.icon("file")} ${d.editingId ? "Update quotation draft" : "Create quotation draft"}</button></div></div></div></div><div class="card card-pad quote-history">${ctx.sectionTitle("Quotation status and workflow", "Sending creates a follow-up task. Once accepted, click Create job to generate the linked Job Order and stage tasks.")}${history}</div><div class="card card-pad quote-history">${ctx.sectionTitle("Linked jobs and tasks", "All quotation follow-ups and operational handoff items remain visible from the lead.")}<div class="form-grid"><div><div class="eyebrow" style="color:var(--sub)">Jobs</div>${leadJobs.length ? leadJobs.map((j) => `<div class="list-row"><span class="icon-box">${ctx.icon("briefcase")}</span><div class="grow"><div class="list-title">${j.number}</div><div class="list-sub">${ctx.jobBadges(j)} · ${ctx.money(j.value)}</div></div></div>`).join("") : `<p class="muted small">No Job Order linked yet.</p>`}</div><div><div class="eyebrow" style="color:var(--sub)">Tasks</div>${leadTasks.length ? leadTasks.map((x) => `<div class="list-row"><span class="icon-box">${ctx.icon("tasks")}</span><div class="grow"><div class="list-title">${ctx.esc(x.title)}</div><div class="list-sub">${x.category} · Due ${ctx.fmt(x.dueAt, true)}</div></div>${ctx.badge(x.status)}</div>`).join("") : `<p class="muted small">No tasks linked yet.</p>`}</div></div></div>`,
      "full",
      "close-modal",
    );
  }

  function renderQuoteCard(q, lead) {
    const job = q.linkedJobId ? ctx.jobOf(q.linkedJobId) : null,
      follow = q.followUpTaskId
        ? ctx.state.tasks.find((t) => t.id === q.followUpTaskId)
        : null;
    let actions = `<button class="btn ghost sm" data-action="preview-quote" data-id="${q.id}">${ctx.icon("eye", "sm")} Preview</button><button class="btn ghost sm" data-action="download-quote" data-id="${q.id}">${ctx.icon("download", "sm")} Download / share</button>`;
    if (q.status === "Draft")
      actions += `<button class="btn ghost sm" data-action="edit-quote" data-id="${q.id}">${ctx.icon("edit", "sm")} Edit draft</button><button class="btn secondary sm" data-action="ready-quote" data-id="${q.id}">${ctx.icon("check", "sm")} Mark ready</button>`;
    if (q.status === "Ready")
      actions += `<button class="btn sm" data-action="send-quote" data-id="${q.id}">${ctx.icon("mail", "sm")} Send email</button>`;
    if (q.status === "Sent")
      actions += `<button class="btn success sm" data-action="quote-status" data-status="Accepted" data-id="${q.id}">${ctx.icon("check", "sm")} Accept</button><button class="btn danger sm" data-action="quote-status" data-status="Rejected" data-id="${q.id}">Reject</button>`;
    if (q.status === "Accepted" && !job)
      actions += `<button class="btn sm" data-action="create-quote-job" data-id="${q.id}">${ctx.icon("briefcase", "sm")} Create job</button>`;
    if (job)
      actions += `<button class="btn secondary sm" data-action="open-job" data-id="${job.id}">Open job</button>`;
    return `<div class="quote-card"><div class="quote-card-top"><div><div class="row wrap gap8"><h4>${ctx.esc(q.number)}</h4>${ctx.badge(q.status)}</div><div class="strong small mt8">${q.items.length} line items · Valid until ${ctx.fmt(q.validUntil)} · ${ctx.money(q.total)}</div><div class="secondary-line">Email: ${ctx.esc(q.recipientEmail || lead.email || "Not set")}${q.sentAt ? ` · Sent ${ctx.fmt(q.sentAt, true)}` : ""}</div><div class="row wrap gap6 mt8">${job ? ctx.badge(`Job: ${job.number}`) : ctx.badge("No Job Order yet")}${follow ? ctx.badge(`Task: ${follow.status}`) : ctx.badge("No follow-up task")}</div></div></div><div class="quote-actions">${actions}</div></div>`;
  }

  function renderContacts() {
    const q = (ctx.ui.contactSearch || "").toLowerCase(),
      map = new Map();
    ctx.state.leads.forEach((l) => {
      const c = map.get(l.email) || {
        name: l.customer,
        email: l.email,
        phone: l.phone,
        suburb: l.suburb,
        leads: 0,
        jobs: 0,
        invoiced: 0,
        outstanding: 0,
      };
      c.leads++;
      map.set(l.email, c);
    });
    ctx.state.jobs.forEach((j) => {
      const l = ctx.leadOf(j.leadId),
        c = l && map.get(l.email);
      if (c) c.jobs++;
    });
    ctx.state.invoices.forEach((i) => {
      const c = [...map.values()].find((x) => x.name === i.customer);
      if (c) {
        c.invoiced += i.total;
        c.outstanding += i.balance;
      }
    });
    const contacts = [...map.values()].filter((c) =>
      `${c.name} ${c.email} ${c.phone} ${c.suburb}`.toLowerCase().includes(q),
    );
    const rows = contacts
      .map(
        (c) =>
          `<tr><td><div class="row gap10"><span class="avatar">${ctx.initials(c.name)}</span><div><strong>${ctx.esc(c.name)}</strong><div class="secondary-line">${ctx.esc(c.email)} · ${ctx.esc(c.phone)}</div></div></div></td><td>${ctx.esc(c.suburb)}</td><td class="strong">${c.leads}</td><td class="strong">${c.jobs}</td><td class="strong">${ctx.money(c.invoiced)}</td><td>${ctx.badge(ctx.money(c.outstanding))}</td></tr>`,
      )
      .join("");
    return `${ctx.header("CUSTOMER DIRECTORY", "One client record across every interaction.", "See lead history, jobs, invoices and outstanding balances without duplicate contact records.")}<div class="card toolbar"><input class="input" style="max-width:none" placeholder="Search customer, email, phone or suburb" value="${ctx.attr(ctx.ui.contactSearch || "")}" data-filter="contactSearch" data-focus="contact-search"></div><div class="card"><div class="table-wrap desktop-table"><table class="data-table"><thead><tr><th>Customer</th><th>Suburb</th><th>Leads</th><th>Jobs</th><th>Invoiced</th><th>Outstanding</th></tr></thead><tbody>${rows}</tbody></table></div><div class="cards-mobile">${contacts.map((c) => `<div class="mobile-card"><div class="row gap10"><span class="avatar">${ctx.initials(c.name)}</span><div class="grow"><strong>${ctx.esc(c.name)}</strong><div class="secondary-line">${ctx.esc(c.phone)} · ${ctx.esc(c.suburb)}</div></div>${ctx.badge(ctx.money(c.outstanding))}</div><div class="row wrap gap6 mt12">${ctx.badge(`${c.leads} leads`)}${ctx.badge(`${c.jobs} jobs`)}${ctx.badge(`${ctx.money(c.invoiced)} invoiced`)}</div></div>`).join("")}</div></div>`;
  }

  function renderQuotes() {
    return `${ctx.header("QUOTATION REGISTER", "Every quotation stays connected to its lead.", "Create, edit and send quotations from the Lead workspace. This register gives managers a complete status view across sales, jobs and follow-up tasks.", `<button class="btn" data-page="leads">${ctx.icon("users")} Open leads</button>`)}<div class="job-grid">${ctx.state.quotes
      .map((q) => {
        const l = ctx.leadOf(q.leadId),
          j = q.linkedJobId ? ctx.jobOf(q.linkedJobId) : null,
          t = q.followUpTaskId
            ? ctx.state.tasks.find((x) => x.id === q.followUpTaskId)
            : null;
        return `<div class="card card-pad"><div class="job-top"><div><div class="eyebrow">${ctx.esc(q.number)}</div><h3 style="font-size:18px;margin:5px 0">${ctx.esc(q.customer)}</h3></div>${ctx.badge(q.status)}</div><div style="font-size:29px;font-weight:900;margin:13px 0">${ctx.money(q.total)}</div><div class="divider"></div><div class="form-stack small muted" style="gap:7px"><span>Lead: <strong>${ctx.esc(l?.number || "Not linked")}</strong></span><span>Items: <strong>${q.items.length}</strong></span><span>Valid until: <strong>${ctx.fmt(q.validUntil)}</strong></span><span>Recipient: <strong>${ctx.esc(q.recipientEmail || l?.email || "Not set")}</strong></span>${q.sentAt ? `<span>Sent: <strong>${ctx.fmt(q.sentAt, true)}</strong></span>` : ""}</div><div class="row wrap gap6 mt12">${ctx.badge(j ? `Job ${j.number}` : "No Job Order")}${ctx.badge(t ? `Follow-up ${t.status}` : "No follow-up task")}</div><div class="quote-actions">${q.status === "Accepted" && !j ? `<button class="btn sm" data-action="create-quote-job" data-id="${q.id}">${ctx.icon("briefcase", "sm")} Create job</button>` : ""}${j ? `<button class="btn secondary sm" data-action="open-job" data-id="${j.id}">Open job</button>` : ""}<button class="btn sm" data-action="manage-quote" data-id="${q.id}">${ctx.icon("edit", "sm")} Manage in lead</button>${q.status === "Sent" ? `<button class="btn secondary sm" data-action="quote-status" data-id="${q.id}" data-status="Accepted">Accept</button>` : ""}<button class="btn ghost sm icon-only" data-action="download-quote" data-id="${q.id}" title="Download">${ctx.icon("download", "sm")}</button></div></div>`;
      })
      .join("")}</div>`;
  }

  function renderJobs() {
    const installer = ctx.state.session.role === "installer",
      user = ctx.currentUser();
    const jobs = ctx.state.jobs.filter(
      (j) =>
        ctx.canViewJob(j) &&
        ctx.inWorkJob(j.id) &&
        (ctx.ui.jobFilter === "All" ||
          j.status === ctx.ui.jobFilter ||
          ctx.jobApprovalStatus(j) === ctx.ui.jobFilter),
    );
    return `${ctx.header(installer ? "FIELD JOBS" : "OPERATIONS", installer ? "Your assigned work." : "Jobs built around the real workflow.", installer ? "Collect, travel, install, reconcile and complete." : "Applicable stock, repair, installation and evidence work stays connected.")}${ctx.canManageJobCreation() ? `<button class="btn mb16" data-action="workflow-create">Create job</button>` : ""}<div class="card toolbar"><select class="select" data-filter="jobFilter"><option>All</option>${[...ctx.jobStatuses, "Pending Approval", "Approved"].map((s) => `<option ${ctx.ui.jobFilter === s ? "selected" : ""}>${s}</option>`).join("")}</select><span class="result-count">${jobs.length} job${jobs.length === 1 ? "" : "s"}</span></div><div class="job-grid">${jobs.map((j) => ctx.renderJobCard(j, installer)).join("") || `<div class="card empty">No jobs match this filter.</div>`}</div>`;
  }

  function renderJobCard(j, installer) {
    const assigned = ctx.state.users.find((u) => u.id === j.installerId),
      picked = j.items.reduce((s, x) => s + Number(x.quantityMatched || 0), 0),
      required = j.items.reduce((s, x) => s + x.quantityRequired, 0),
      applicable = ctx.visibleJobTasks(j).filter((t) => applicableTask(t, j)),
      progress =
        j.status === "Completed"
          ? 100
          : applicable.length
            ? Math.round(
                (applicable.filter((t) => t.status === "Completed").length /
                  applicable.length) *
                  100,
              )
            : 0;
    return `<div class="card job-card clickable" data-action="open-job-work" data-id="${j.id}"><div class="job-top"><div><div class="eyebrow">${ctx.esc(j.number)}</div><div class="mt8">${ctx.jobBadges(j)}</div></div><span class="icon-box ${j.financialHold ? "red" : "green"}">${ctx.icon(j.financialHold ? "shield" : "briefcase")}</span></div><h3>${ctx.esc(j.customer)}</h3><div class="muted small">${ctx.esc(j.address)}, ${ctx.esc(j.suburb)}</div><div class="form-grid mt16"><div><div class="eyebrow" style="color:var(--sub)">Service</div><strong class="small">${ctx.esc(j.service)}</strong></div><div><div class="eyebrow" style="color:var(--sub)">Work scheduled</div><strong class="small">${ctx.fmt(j.installationDate)}</strong></div></div><div class="mt16"><div class="workload-head"><span>Applicable work completed</span><span>${applicable.filter((t) => t.status === "Completed").length}/${applicable.length}</span></div><div class="progress"><span style="width:${progress}%"></span></div></div><div class="row wrap gap6 mt12">${ctx.badge(`${applicable.filter((t) => t.status === "Completed").length}/${applicable.length} tasks complete`)}${ctx.stageBlockers(j, ctx.nextJobStage(j)).length ? ctx.badge(`${ctx.stageBlockers(j, ctx.nextJobStage(j)).length} stage tasks pending`) : ctx.badge("Stage tasks cleared")}</div><div class="task-foot"><div class="row gap8"><span class="avatar" style="width:32px;height:32px">${assigned?.avatar || "?"}</span><span class="small strong">${installer ? "Assigned to you" : ctx.esc(assigned?.name || "Unassigned")}</span></div>${installer ? ctx.icon("arrow") : `<strong>${ctx.money(j.value)}</strong>`}</div></div>`;
  }

  function renderWorkContext() {
    const c = ctx.ui.workContext;
    if (!c || c.page !== ctx.ui.page) return "";
    const t = c.taskId ? ctx.state.tasks.find((x) => x.id === c.taskId) : null,
      j = ctx.jobOf(c.jobId);
    if ((t && !ctx.canViewTask(t)) || (j && !ctx.canViewJob(j))) return "";
    return `<section class="card card-pad work-context"><div class="row wrap gap12"><div class="grow"><div class="eyebrow">Related work · ${ctx.esc(ctx.PAGE_TITLES[c.page])}</div><h3>${ctx.esc(t?.title || j?.number || "Selected work")}</h3><p class="small muted">${ctx.esc(j ? `${j.number} · ${j.customer}` : "General task")}${c.stage ? ` · ${ctx.esc(c.stage)}` : ""}</p></div><div class="row wrap gap8">${j ? `<button class="btn ghost sm" data-action="open-job" data-id="${ctx.attr(j.id)}">Job details</button>` : ""}<button class="btn ghost sm" data-action="clear-work-context">Show all ${ctx.esc(ctx.PAGE_TITLES[c.page])}</button></div></div>${t ? `<div class="row wrap gap12 mt12">${ctx.badge(t.status)}${t.workflowAction === "collection-restock" ? `${ctx.badge(t.priority)}<span class="small strong">${t.shortfall || 0} additional unit(s) needed · ${t.availableQuantity || 0} available for this job</span>` : ""}<span class="small muted">Assigned to ${ctx.esc(ctx.userName(t.assignedTo))}</span><div class="grow"></div>${ctx.taskActionButtons(t)}</div>` : ""}${c.page === "purchasing" ? '<p class="small muted">Showing purchase orders for the job’s required products.</p>' : ""}</section>`;
  }

  function renderJobStageTasks(j) {
    const tasks = ctx.visibleJobTasks(j).filter((t) => applicableTask(t, j)),
      pending = ctx.stageBlockers(j, ctx.nextJobStage(j)),
      stages = j.stages?.length
        ? j.stages.map((s) => s.id)
        : [...new Set([j.status, ...tasks.map((t) => t.jobStage)])].sort(
            (a, b) => ctx.stageRank(a) - ctx.stageRank(b),
          );
    return `<div class="card card-pad mt16 job-stage-tasks">${ctx.sectionTitle("Job stages & tasks", ctx.isInstaller() ? "Your assigned tasks for this job. Other required work may need your manager’s attention." : "Required tasks, evidence and stock obligations gate progression.", ctx.state.session.role !== "installer" && ctx.canRunAction("new-task") ? `<button class="btn secondary sm" data-action="new-task" data-job-id="${ctx.attr(j.id)}">${ctx.icon("plus", "sm")} Add task</button>` : "")}<div class="row wrap gap8">${ctx.badge(`Current: ${j.status}`)}${ctx.badge(`${tasks.filter((t) => t.status === "Completed").length}/${tasks.length} tasks complete`)}${ctx.badge(pending.length ? `${pending.length} blocking task${pending.length === 1 ? "" : "s"}` : "Current tasks complete")}</div>${stages
      .map((stage) => {
        const xs = tasks.filter((t) => t.jobStage === stage);
        return `<section class="job-task-stage mt16"><div class="row wrap gap8"><h4><button class="link-btn" data-action="open-stage-work" data-id="${ctx.attr(j.id)}" data-stage="${ctx.attr(stage)}">${ctx.esc(ctx.stageLabel(j, stage))} ${ctx.icon("arrow", "sm")}</button></h4>${stage === j.status ? ctx.badge("Current stage") : ""}${j.stages?.find((s) => s.id === stage)?.applicable === false ? ctx.badge("Not applicable") : ""}${j.stages?.find((s) => s.id === stage)?.origin === "manual" ? ctx.badge("Manual") : ""}<span class="small muted">${xs.filter((t) => t.status === "Completed").length}/${xs.length} complete</span></div>${xs.length ? xs.map((t) => `<div class="job-task-row" data-job-task="${ctx.attr(t.id)}"><div class="grow"><button class="link-btn task-title-link" data-action="open-task-work" data-id="${ctx.attr(t.id)}">${ctx.esc(t.title)} ${ctx.icon("arrow", "sm")}</button><div class="list-sub">${ctx.esc(ctx.userName(t.assignedTo))} · Due ${ctx.fmt(t.dueAt, true)}</div>${t.notes ? `<p class="small muted">${ctx.esc(t.notes)}</p>` : ""}<div class="row wrap gap6">${ctx.badge(t.status)}${ctx.badge(t.priority)}${!t.assignedTo ? ctx.badge("Unassigned — manager action required") : ""}</div></div><div class="job-task-actions">${ctx.taskActionButtons(t)}${ctx.state.session.role !== "installer" && ctx.hasCapability("task_manage") && t.status !== "Completed" ? `<button class="link-btn small mt8" data-action="new-task" data-id="${ctx.attr(t.id)}" data-job-id="${ctx.attr(j.id)}">Edit task</button>` : ""}</div></div>`).join("") : `<p class="small muted">No tasks linked to this stage. Product checks and existing permissions still apply.</p>`}</section>`;
      })
      .join("")}</div>`;
  }

  function renderJobDetail(id) {
    const j = ctx.jobOf(id);
    if (!ctx.canViewJob(j)) return "";
    const installer = ctx.state.session.role === "installer",
      assigned = ctx.state.users.find((u) => u.id === j.installerId),
      picked = j.items.reduce((s, x) => s + Number(x.quantityMatched || 0), 0),
      required = j.items.reduce((s, x) => s + x.quantityRequired, 0);
    let body = `<div class="tabs subtabs">${["Overview", "Products", "Photos", "Timeline", "Review"].map((t) => `<button class="tab ${ctx.ui.jobTab === t.toLowerCase() ? "active" : ""}" data-action="job-tab" data-tab="${t.toLowerCase()}">${t}</button>`).join("")}</div>`;
    if (ctx.ui.jobTab === "overview")
      body += `<div class="contact-hero"><div class="grow"><h3>${ctx.esc(j.customer)}</h3><p>${ctx.esc(j.address)}, ${ctx.esc(j.suburb)}</p></div>${ctx.jobBadges(j)}</div><div class="facts mt16">${ctx.infoFact("Installer", assigned?.name || "Unassigned")}${ctx.infoFact("Installation", ctx.fmt(j.installationDate, true))}${ctx.infoFact("Warehouse", j.warehouse)}${j.quoteId ? ctx.infoFact("Quotation", ctx.quoteOf(j.quoteId)?.number || "Linked quotation") : ""}${ctx.infoFact("Outstanding", installer ? (j.financialHold ? "Payment hold" : "Cleared") : ctx.money(j.outstanding))}</div>${j.financialHold ? `<div class="form-note mt16" style="background:var(--red2);color:var(--red);border-color:#f3c8cf"><strong>Financial hold</strong><br>${installer ? "Contact your manager before proceeding." : "Required payment has not been received."}</div>` : ""}${j.notes ? `<div class="form-note mt16">${ctx.esc(j.notes)}</div>` : ""}${installer ? `<div class="job-actions"><a class="btn dark" href="tel:${ctx.attr(j.phone.replace(/[^+\d]/g, ""))}">${ctx.icon("phone")} Call customer</a><a class="btn secondary" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${j.address}, ${j.suburb}`)}" target="_blank" rel="noopener">${ctx.icon("map")} Open directions</a></div>` : ""}`;
    if (ctx.ui.jobTab === "overview")
      body +=
        (ctx.jobApprovals?.summary(j) || "") +
        `<div class="form-note mt16"><strong>Completion approval</strong><p>${j.status === "Completed" ? ctx.esc(ctx.jobApprovalStatus(j)) : "Available after completion"}</p><button class="btn secondary sm" data-action="approval-review" data-id="${ctx.attr(j.id)}">Review completed work</button>${ctx.jobApprovals?.failure ? `<p role="alert">${ctx.esc(ctx.jobApprovals.failure)}</p>` : ""}</div>`;
    if (ctx.ui.jobTab === "review")
      body +=
        ctx.jobApprovals?.reviewPanel(j) ||
        '<p class="form-note">Job approval requires the connected approval backend.</p>';
    if (ctx.ui.jobTab === "products")
      body +=
        (ctx.workflowControls?.controls(j) || "") +
        ctx.renderProductRequestForm(j) +
        (j.extraItems || [])
          .map(
            (x) =>
              `<div class="form-note mt12"><strong>Approved addition: ${ctx.esc(x.name)}</strong><p>${ctx.esc(x.sku)} · ${x.approvedReturnOnly ? `${x.returnAuthorizedQty} approved for return collection` : `${x.quantityIssued} collected`}</p></div>`,
          )
          .join("") +
        `<div>${j.items.length ? j.items.map((x) => `<div class="item-row"><span class="icon-box">${ctx.icon("box")}</span><div class="grow"><div class="item-name">${ctx.esc(x.name)}</div><div class="item-meta">${ctx.esc(x.sku)} · ${ctx.esc(x.room)} · ${ctx.esc(x.measurements)}</div><div class="row wrap gap6 mt8">${ctx.badge(`Required ${x.quantityRequired}`)}${ctx.badge(`Scan matched ${Number(x.quantityMatched || 0)}`)}${ctx.badge(`Collected ${x.quantityIssued ?? (j.collectionIssuedAt ? x.quantityPicked : 0)}`)}${ctx.badge(`Used ${x.quantityUsed}`)}</div></div>${installer && ["Collected", "Installation Scheduled", "Installation in Progress"].includes(j.status) ? `<div class="field" style="width:90px"><label>Used</label><input class="input" type="number" min="0" max="${x.quantityPicked}" value="${ctx.ui.jobUsed?.[x.id] ?? x.quantityPicked}" data-used-item="${x.id}" data-focus="used-${x.id}"></div>` : ""}</div>`).join("") : `<div class="empty">No products have been added to this Job Order.</div>`}</div>`;
    if (ctx.ui.jobTab === "photos")
      body +=
        ctx.renderInstallationProof(j) +
        `${installer && j.workflowVersion !== 1 ? `<div class="row wrap gap8 mt16"><label class="btn secondary">${ctx.icon("camera")} Add before photo<input type="file" accept="image/*" capture="environment" data-photo-job="${j.id}" data-photo-type="Before" hidden></label></div>` : ""}<div class="photo-grid mt16">${(installer ? (j.photos || []).filter((p) => p.userId === ctx.currentUser().id) : j.photos || []).map((p) => `<div class="photo-card"><img src="${ctx.attr(p.uri)}" alt="${ctx.attr(p.type)} installation"><div class="photo-cap">${ctx.badge(p.type)}<span class="small muted">${ctx.fmt(p.createdAt, true)} · Earlier photo</span></div></div>`).join("")}</div>`;
    if (ctx.ui.jobTab === "timeline")
      body += `<div class="timeline">${(installer ? j.timeline.filter((e) => e.userId === ctx.currentUser().id) : j.timeline).length ? (installer ? j.timeline.filter((e) => e.userId === ctx.currentUser().id) : j.timeline).map((e) => `<div class="timeline-item"><div class="timeline-title">${ctx.esc(e.title)}</div><div class="timeline-detail">${ctx.esc(e.detail)}</div><div class="timeline-time">${ctx.fmt(e.at, true)}</div></div>`).join("") : `<div class="empty">No activity recorded yet.</div>`}</div>`;
    if (ctx.ui.jobTab === "overview")
      body +=
        `<div class="form-note mt16"><strong>Work evidence</strong><p class="small">${ctx.hasInstallationProof(j) ? "Photo/video and device location saved." : "A photo or video of completed work with device location is required before job completion."}</p><button class="btn secondary sm" data-action="open-installation-proof" data-id="${ctx.attr(j.id)}">View / upload evidence</button></div><button class="btn secondary mt16" data-action="open-stage-work" data-id="${ctx.attr(j.id)}" data-stage="${ctx.attr(j.status)}">${ctx.icon("arrow")} Open ${ctx.esc(ctx.PAGE_TITLES[ctx.stageDestination(j.status)])} for this stage</button>` +
        ctx.renderJobStageTasks(j) +
        (ctx.workflowControls?.controls(j) || "");
    if (ctx.ui.jobTab === "overview")
      body += ctx.renderReopenControls(j) + ctx.renderJobFinancials(j);
    return ctx.modalFrame(
      j.number,
      `${j.customer} · ${j.service}`,
      body,
      "wide",
      "close-modal",
      (ctx.canManageJobDetails()
        ? `<button class="btn secondary" data-action="edit-job" data-id="${j.id}">${ctx.icon("edit")} Edit job</button>`
        : "") + ctx.stageActionButton(j),
    );
  }

  function renderTasks() {
    const installer = ctx.state.session.role === "installer",
      user = ctx.currentUser(),
      visible = ctx.state.tasks.filter(
        (t) =>
          ctx.canViewTask(t) &&
          ctx.inWorkJob(t.jobId) &&
          (ctx.ui.taskFilter === "All" || t.status === ctx.ui.taskFilter),
      );
    return `${ctx.header(installer ? "MY WORK" : "TASK CONTROL", installer ? "What needs doing next." : "Every action, one accountable owner.", installer ? "Start, update and complete only the work assigned to you." : "Sales, warehouse, installation and billing work remain connected to the relevant job.", !installer ? `<button class="btn" data-action="new-task">${ctx.icon("plus")} Create task</button>` : "")}<div class="card toolbar"><select class="select" data-filter="taskFilter">${["All", ...ctx.taskStatuses].map((s) => `<option ${ctx.ui.taskFilter === s ? "selected" : ""}>${s}</option>`).join("")}</select></div><div class="kanban">${ctx.taskStatuses
      .filter((s) => ctx.ui.taskFilter === "All" || ctx.ui.taskFilter === s)
      .map((s) => {
        const xs = visible.filter((t) => t.status === s);
        return `<div class="kanban-col"><div class="kanban-head"><span>${s}</span>${ctx.badge(String(xs.length))}</div>${xs.map((t) => ctx.renderTaskCard(t, installer)).join("") || `<div class="card empty" style="padding:28px">No ${s.toLowerCase()} tasks</div>`}</div>`;
      })
      .join("")}</div>`;
  }

  function renderTaskCard(t, installer) {
    const u = ctx.state.users.find((x) => x.id === t.assignedTo),
      j = ctx.jobOf(t.jobId);
    return `<div class="card task-card" data-action="open-task-work" data-id="${ctx.attr(t.id)}"><div class="row" style="justify-content:space-between"><span class="icon-box ${t.category === "Billing" ? "amber" : t.category === "Installation" ? "red" : ""}">${ctx.icon(t.category === "Billing" ? "receipt" : t.category === "Picking" ? "scan" : t.category === "Collection" ? "box" : t.category === "Installation" ? "settings" : t.category === "Return" ? "undo" : t.category === "Sales" ? "users" : "briefcase")}</span>${ctx.badge(t.priority)}</div><h4><button class="link-btn task-title-link" data-action="open-task-work" data-id="${ctx.attr(t.id)}">${ctx.esc(t.title)} ${ctx.icon("arrow", "sm")}</button></h4><p>${ctx.esc(t.notes)}</p>${t.workflowAction === "collection-restock" ? `<p class="small strong">${t.shortfall || 0} additional unit(s) needed · ${t.availableQuantity || 0} available for this job</p>` : ""}<div class="task-meta"><span>${ctx.icon("calendar", "sm")} ${ctx.fmt(t.dueAt, true)}</span>${j ? `<button class="link-btn" data-action="open-task-work" data-id="${ctx.attr(t.id)}">${ctx.icon("briefcase", "sm")} ${ctx.esc(j.number)}</button><span>Stage: ${ctx.esc(t.jobStage)}</span>` : ""}</div><div class="task-foot"><div class="row gap8"><span class="avatar" style="width:30px;height:30px">${u?.avatar || "?"}</span><span class="small strong">${t.assignedTo === ctx.currentUser()?.id ? "You" : ctx.esc(u?.name || "Unassigned")}</span></div><div class="task-actions">${ctx.taskActionButtons(t)}${!installer && !t.returnId && !t.requestId && ctx.hasCapability("task_manage") && t.status !== "Completed" ? `<button class="link-btn small mt8" data-action="new-task" data-id="${ctx.attr(t.id)}">Edit task</button>` : ""}</div></div></div>`;
  }

  function renderCalendar() {
    const installer = ctx.state.session.role === "installer",
      user = ctx.currentUser(),
      events = [
        ...ctx.state.jobs
          .filter((j) => ctx.canViewJob(j) && ctx.inWorkJob(j.id))
          .map((j) => ({
            id: `job-${j.id}`,
            at: j.installationDate,
            title: `${j.service} installation`,
            detail: `${j.number} · ${j.customer} · ${j.suburb}`,
            type: "Installation",
            status: j.status,
            userId: j.installerId,
          })),
        ...ctx.state.tasks
          .filter((t) => ctx.canViewTask(t) && ctx.inWorkJob(t.jobId))
          .map((t) => ({
            id: `task-${t.id}`,
            at: t.dueAt,
            title: t.title,
            detail: `${t.category} task`,
            type: "Task",
            status: t.status,
            userId: t.assignedTo,
          })),
      ].sort((a, b) => new Date(a.at) - new Date(b.at)),
      groups = {};
    events.forEach((e) =>
      (groups[new Date(e.at).toISOString().slice(0, 10)] ||= []).push(e),
    );
    return `${ctx.header("SCHEDULE", installer ? "Your field calendar." : "Installations, collections and task deadlines.", "A single schedule generated from live jobs and assigned work.")}<div class="card card-pad"><div class="tabs">${["Agenda", "Day", "Week"].map((v) => `<button class="tab ${ctx.ui.calendarView === v ? "active" : ""}" data-action="calendar-view" data-view="${v}">${v}</button>`).join("")}</div></div><div class="stack mt16">${Object.entries(
      groups,
    )
      .map(
        ([day, xs]) =>
          `<div class="card card-pad"><div class="row gap12" style="padding-bottom:12px;border-bottom:1px solid var(--line)"><div class="icon-box" style="width:55px;height:55px;background:var(--navy);color:#fff;flex-direction:column"><strong style="font-size:18px">${new Date(day).toLocaleDateString("en-GB", { day: "2-digit" })}</strong><small style="color:#bcd0ed;text-transform:uppercase">${new Date(day).toLocaleDateString("en-GB", { month: "short" })}</small></div><div><h3 style="margin:0">${new Date(day).toLocaleDateString("en-GB", { weekday: "long" })}</h3><div class="secondary-line">${xs.length} scheduled items</div></div></div>${xs
            .map((e) => {
              const u = ctx.state.users.find((x) => x.id === e.userId);
              return `<div class="list-row clickable" data-action="${e.id.startsWith("job-") ? "open-job-work" : "open-task-work"}" data-id="${ctx.attr(e.id.replace(/^(job|task)-/, ""))}" style="border-left:4px solid ${e.type === "Installation" ? "var(--blue)" : "var(--navy)"};padding-left:13px"><div class="grow"><div class="eyebrow">${new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div><div class="list-title mt8">${ctx.esc(e.title)}</div><div class="list-sub">${ctx.esc(e.detail)}</div></div><span class="avatar" style="width:30px;height:30px">${u?.avatar || "?"}</span>${ctx.badge(e.status)}</div>`;
            })
            .join("")}</div>`,
      )
      .join("")}</div>`;
  }

  function renderEditJob(id) {
    const j = ctx.jobOf(id);
    if (!ctx.canManageJobDetails() || !ctx.canViewJob(j)) return "";
    const field = (label, name, value, type = "text") =>
      `<div class="field"><label>${label}</label><input class="input" type="${type}" ${type === "number" ? 'step="any"' : ""} name="${name}" value="${ctx.attr(value ?? "")}" ${["customer", "service", "installationDate"].includes(name) ? "required" : ""}></div>`;
    return ctx.modalFrame(
      "Edit job",
      `${j.number} · ${ctx.quoteOf(j.quoteId)?.number || "Job details"}`,
      `<form class="form-stack" id="edit-job-form"><div class="form-grid">${field("Customer name", "customer", j.customer)}${field("Phone", "phone", j.phone)}</div>${field("Site address", "address", j.address)}<div class="form-grid">${field("Postcode", "postcode", j.postcode)}${field("Exact site latitude", "latitude", j.latitude, "number")}${field("Exact site longitude", "longitude", j.longitude, "number")}</div><div class="form-grid">${field("Suburb / postcode", "suburb", j.suburb)}${field("Service", "service", j.service)}</div><div class="form-grid"><div class="field"><label>Assigned installer</label><select class="select" name="installerId"><option value="">Unassigned</option>${ctx.state.users
        .filter(
          (u) =>
            u.role === "installer" &&
            (u.status === "Active" || u.id === j.installerId),
        )
        .map(
          (u) =>
            `<option value="${ctx.attr(u.id)}" ${u.id === j.installerId ? "selected" : ""}>${ctx.esc(u.name)}${u.status !== "Active" ? " (inactive)" : ""}</option>`,
        )
        .join(
          "",
        )}</select></div>${field("Installation date / time", "installationDate", ctx.localDateInput(j.installationDate), "datetime-local")}</div>${field("Warehouse", "warehouse", j.warehouse)}<div class="field"><label>Job notes</label><textarea class="textarea" name="notes">${ctx.esc(j.notes || "")}</textarea></div>${j.items.length ? `<div class="divider"></div><h4>Product installation details</h4>${j.items.map((x, i) => `<div><strong class="small">${ctx.esc(x.name)} · ${x.quantityRequired} required</strong><div class="form-grid mt8">${field("Room", `room_${i}`, x.room)}${field("Measurements", `measurements_${i}`, x.measurements)}</div></div>`).join("")}` : ""}<div class="field"><label>Reason for job changes</label><input class="input" name="changeReason" required></div><label><input type="checkbox" name="transferTasks"> Transfer outstanding tasks to the new installer (completed task assignees stay unchanged)</label><div class="form-note">Changing the installer transfers their unfinished tasks to the new installer. Unassigned field tasks are also assigned. Changing the installation date updates unfinished installation tasks that use the previous date. You can edit each linked task separately.</div></form>`,
      "wide",
      "close-modal",
      `<button class="btn ghost" data-action="open-job" data-id="${j.id}">Cancel</button><button class="btn" data-action="save-job" data-id="${j.id}">Save job</button>`,
    );
  }

  function renderNewLead() {
    return ctx.modalFrame(
      "Create a new lead",
      "A clean intake form for phone, web and referral enquiries.",
      `<form class="form-stack" id="new-lead-form"><div class="form-grid"><div class="field"><label class="required">Customer name</label><input class="input" name="customer" placeholder="e.g. Mia Johnson" required></div><div class="field"><label class="required">Phone</label><input class="input" name="phone" placeholder="04xx xxx xxx" required></div></div><div class="field"><label>Email</label><input class="input" type="email" name="email"></div><div class="form-grid"><div class="field"><label>Suburb</label><input class="input" name="suburb"></div><div class="field"><label>Postcode</label><input class="input" name="postcode" inputmode="numeric"></div></div><div class="field"><label>Service</label><select class="select" name="service">${["Roller Blinds", "Plantation Shutters", "Curtains", "Outdoor Blinds", "Blind Repairs"].map((x) => `<option>${x}</option>`).join("")}</select></div><div class="field"><label>Priority</label><select class="select" name="priority">${["Low", "Normal", "High", "Urgent"].map((x) => `<option ${x === "Normal" ? "selected" : ""}>${x}</option>`).join("")}</select></div><div class="field"><label>Estimated value (AUD)</label><input class="input" type="number" name="value" value="2500"></div></form>`,
      "",
      "close-modal",
      `<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="create-lead">${ctx.icon("plus")} Create lead</button>`,
    );
  }

  function renderNewTask() {
    const t = ctx.state.tasks.find((x) => x.id === ctx.ui.modal?.taskId),
      j = ctx.jobOf(t?.jobId || ctx.ui.modal?.returnJobId),
      stage = t?.jobStage || j?.status || "",
      due = t?.dueAt
        ? new Date(t.dueAt).toISOString().slice(0, 16)
        : new Date(Date.now() + 86400000).toISOString().slice(0, 16);
    return ctx.modalFrame(
      t ? "Edit task" : "Create task",
      "Link the task to a Job Order and the stage it must be completed in.",
      `<form class="form-stack" id="new-task-form"><div class="field"><label class="required">Task title</label><input class="input" name="title" value="${ctx.attr(t?.title || "")}" required></div><div class="form-grid"><div class="field"><label>Job Order</label><select class="select" name="jobId" data-task-job><option value="">General task — no job</option>${ctx.state.jobs
        .filter((x) => x.status !== "Completed")
        .map(
          (x) =>
            `<option value="${ctx.attr(x.id)}" ${j?.id === x.id ? "selected" : ""}>${ctx.esc(x.number)} · ${ctx.esc(x.customer)}</option>`,
        )
        .join(
          "",
        )}</select></div><div class="field"><label>Required job stage</label><select class="select" name="jobStage" ${j ? "required" : "disabled"}><option value="">Select stage</option>${(j
        ?.stages?.length
        ? ctx
            .activeStages(j)
            .filter((s) => s.type !== "Completed")
            .map((s) => s.id)
        : ctx.WORK_STAGES
      )
        .map(
          (x) =>
            `<option value="${ctx.attr(x)}" ${stage === x ? "selected" : ""}>${ctx.esc(j ? ctx.stageLabel(j, x) : x)}</option>`,
        )
        .join(
          "",
        )}</select></div></div><div class="form-note">Linked tasks block progression until their assigned person completes them. General tasks do not block a job.</div><div class="field"><label>Category</label><select class="select" name="category">${["Sales", "Warehouse", "Picking", "Collection", "Installation", "Return", "Billing"].map((x) => `<option ${(t?.category || "Installation") === x ? "selected" : ""}>${x}</option>`).join("")}</select></div><div class="field"><label>Priority</label><select class="select" name="priority">${["Low", "Normal", "High", "Urgent"].map((x) => `<option ${(t?.priority || "Normal") === x ? "selected" : ""}>${x}</option>`).join("")}</select></div><div class="field"><label>Assign to</label><select class="select" name="assignedTo" required><option value="">Select assignee</option>${ctx.state.users
        .filter(
          (u) =>
            u.status === "Active" &&
            (u.role !== "super_admin" || ctx.isMasterSession()),
        )
        .map(
          (u) =>
            `<option value="${ctx.attr(u.id)}" ${(t?.assignedTo || j?.installerId || "u-installer") === u.id ? "selected" : ""}>${ctx.esc(u.name)} · ${ctx.roleLabel(u.role)}</option>`,
        )
        .join(
          "",
        )}</select></div><div class="field"><label>Due date/time</label><input class="input" type="datetime-local" name="dueAt" required value="${ctx.attr(due)}"></div><div class="field"><label>Notes</label><textarea class="textarea" name="notes">${ctx.esc(t?.notes || "")}</textarea></div></form>`,
      "",
      "close-modal",
      `<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="create-task">${t ? "Save task" : "Create task"}</button>`,
    );
  }

  function renderSendQuote(id) {
    const q = ctx.quoteOf(id),
      l = q && ctx.leadOf(q.leadId);
    if (!q) return "";
    return ctx.modalFrame(
      "Send quotation by email",
      "The lead email is prefilled. You may replace it with a custom recipient email.",
      `<form class="form-stack" id="send-quote-form"><div class="field"><label>Recipient email</label><input class="input" type="email" name="email" value="${ctx.attr(q.recipientEmail || l?.email || "")}" placeholder="client@example.com"></div><div class="form-note">Demo mode simulates delivery. Live mode in the supplied application calls its included Supabase Edge Function and only marks the quotation Sent after the provider confirms success.</div></form>`,
      "",
      "close-child",
      `<button class="btn ghost" data-action="close-child">Cancel</button><button class="btn" data-action="confirm-send-quote" data-id="${q.id}">${ctx.icon("mail")} Send quotation</button>`,
    );
  }

  function renderQuotePreview(id) {
    const q = ctx.quoteOf(id),
      l = q && ctx.leadOf(q.leadId);
    if (!q) return "";
    return ctx.modalFrame(
      `${q.number} · Preview`,
      "Customer-ready quotation with inventory and service line items.",
      ctx.quotationView(q, l),
      "full",
      "close-child",
      `<button class="btn ghost" data-action="close-child">Close</button><button class="btn" data-action="download-quote" data-id="${q.id}">${ctx.icon("download")} Download / share</button>`,
    );
  }
  return {
    renderLeads,
    renderLeadWorkspace,
    renderQuoteCard,
    renderContacts,
    renderQuotes,
    renderJobs,
    renderJobCard,
    renderWorkContext,
    renderJobStageTasks,
    renderJobDetail,
    renderTasks,
    renderTaskCard,
    renderCalendar,
    renderEditJob,
    renderNewLead,
    renderNewTask,
    renderSendQuote,
    renderQuotePreview,
  };
}
