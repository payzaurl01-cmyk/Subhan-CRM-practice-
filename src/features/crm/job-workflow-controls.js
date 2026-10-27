import {
  WORK_STAGES,
  activeStages,
  editStage,
  reconcileWorkflow,
  updateProduct,
  workType,
  stockFacts,
} from "./job-workflow.js";
export function createJobWorkflowControls({
  ctx,
  backend,
  apply,
  prepare,
  render,
}) {
  let modal = null,
    busy = false,
    error = "",
    pending = null;
  const e = ctx.esc;
  const button = (action, label, id = "") =>
    `<button type="button" class="btn secondary sm" data-action="workflow-${action}" data-id="${e(id)}" ${busy ? "disabled" : ""}>${e(label)}</button>`;
  const field = (key, label, value = "", type = "text") =>
    `<div class="field"><label for="workflow-${key}">${e(label)}</label><input id="workflow-${key}" class="input" name="${key}" type="${type}" ${type === "number" ? 'step="any" min="0"' : ""} value="${e(value)}"></div>`;
  const select = (key, label, options, value = "") =>
    `<div class="field"><label for="workflow-${key}">${e(label)}</label><select id="workflow-${key}" class="select" name="${key}">${options.map(([id, name]) => `<option value="${e(id)}" ${id === value ? "selected" : ""}>${e(name)}</option>`).join("")}</select></div>`;
  const manager = () => ctx.canManageJobDetails();
  function controls(job) {
    return manager()
      ? `<div class="row wrap gap8 mt12">${job.status !== "Completed" ? button("product", "Add / edit products", job.id) + button("stage", "Add / edit stage", job.id) + button("reconcile", "Recalculate applicable stages", job.id) : '<p class="small muted">Reopen this completed job before adding or changing work.</p>'}</div>`
      : "";
  }
  function renderModal() {
    if (!modal) return "";
    const job = ctx.jobOf(modal.id),
      stage = job?.stages?.find((s) => s.id === modal.stageId),
      line = job?.items.find((x) => x.id === modal.lineId);
    const assignees = [
      ["", "Unassigned"],
      ...ctx.state.users
        .filter((u) => u.status === "Active")
        .map((u) => [u.id, u.name]),
    ];
    let body = "";
    if (modal.type === "create")
      body =
        field("customer", "Customer") +
        field("phone", "Phone") +
        field("address", "Job site address") +
        field("postcode", "Postcode") +
        select("workType", "Work type", [
          ["installation", "Installation"],
          ["repair", "Repair"],
          ["supply", "Supply only"],
        ]) +
        select("installerId", "Assigned installer", [
          ["", "Unassigned"],
          ...ctx.state.users
            .filter((u) => u.role === "installer" && u.status === "Active")
            .map((u) => [u.id, u.name]),
        ]) +
        field(
          "installationDate",
          "Scheduled date",
          new Date(Date.now() + 86400000).toISOString().slice(0, 16),
          "datetime-local",
        );
    if (modal.type === "product")
      body =
        select(
          "lineId",
          "Existing line",
          [
            ["", "Add a new product"],
            ...job.items.map((x) => [
              x.id,
              `${x.name} · ${x.quantityRequired} required`,
            ]),
          ],
          modal.lineId || "",
        ) +
        select(
          "productId",
          "Product / variant",
          ctx.state.products.map((p) => [p.id, `${p.name} · ${p.sku}`]),
          line?.productId || "",
        ) +
        field(
          "quantityRequired",
          "Required quantity",
          line?.quantityRequired ?? 1,
          "number",
        ) +
        select(
          "fulfilmentSource",
          "Fulfilment source",
          [
            ["company", "Company inventory"],
            ["customer", "Customer supplied"],
          ],
          line?.fulfilmentSource || "company",
        ) +
        select(
          "cancelled",
          "Line state",
          [
            ["false", "Active"],
            ["true", "Excluded / cancelled"],
          ],
          String(!!line?.cancelled),
        ) +
        field(
          "unitGross",
          "Confirmed variation unit price (including tax)",
          line?.approvedUnitGross ??
            job?.billingBasis?.lines?.find((x) => x.itemId === line?.id)
              ?.unitGross ??
            0,
          "number",
        ) +
        `<div class="field"><label>Outstanding tasks that depend on this product</label>${ctx.state.tasks
          .filter(
            (t) =>
              t.jobId === job.id &&
              !["Completed", "Not applicable"].includes(t.status),
          )
          .map(
            (t) =>
              `<label><input type="checkbox" name="dependentTaskIds" value="${e(t.id)}"> ${e(t.title)}</label>`,
          )
          .join("")}</div>` +
        `<label><input type="checkbox" name="priceConfirmed"> I confirm the variation price; issued documents and payments stay in their established reconciliation process.</label><p class="small muted">Issued/consumed stock must be returned or corrected before reducing the obligation. Reservations and unissued picks are reconciled transactionally where a normalized stock mapping exists.</p>`;
    if (modal.type === "stage")
      body =
        select(
          "stageId",
          "Existing stage",
          [
            ["", "Add a manual stage"],
            ...(job.stages || [])
              .filter((s) => s.status !== "Completed")
              .map((s) => [s.id, `${s.name} · ${s.origin}`]),
          ],
          stage?.id || "",
        ) +
        field("name", "Stage name", stage?.name || "") +
        field("description", "Description", stage?.description || "") +
        select(
          "type",
          "System validation type",
          [
            ["Custom", "Custom work"],
            ...WORK_STAGES.filter((s) => s !== "On Hold").map((s) => [s, s]),
          ],
          stage?.type || "Custom",
        ) +
        select(
          "after",
          "Place after",
          activeStages(job)
            .filter(
              (s) =>
                s.type !== "Completed" &&
                s.status !== "Completed" &&
                s.id !== stage?.id,
            )
            .map((s) => [s.id, s.name]),
          stage?.after || job.status,
        ) +
        select(
          "applicable",
          "Applicability",
          [
            ["true", "Required"],
            ["false", "Not applicable"],
          ],
          String(stage?.applicable !== false),
        ) +
        field("taskTitle", "Required task title") +
        select("assignedTo", "Task assignee", assignees, job.installerId) +
        select(
          "requiredEvidence",
          "Evidence requirement",
          [
            ["none", "No additional evidence"],
            ["before", "Before photo/video (no location)"],
            ["after", "After photo/video with device location"],
          ],
          stage?.requiredEvidence || "none",
        ) +
        `<label><input type="checkbox" name="requiresStock" ${stage?.requiresStock ? "checked" : ""}> This stage depends on outstanding company stock being issued</label>`;
    if (modal.type === "reconcile")
      body =
        "<p>Recalculate generated stages and tasks using current requirements. Completed work and manual stages are preserved. Legacy tasks without trustworthy generator metadata require explicit review.</p>";
    body += field("reason", "Reason");
    return ctx.modalFrame(
      modal.type === "create"
        ? "Create job"
        : modal.type === "product"
          ? "Job products and variations"
          : modal.type === "stage"
            ? "Manage job stages"
            : "Recalculate workflow",
      job?.number || "",
      `<form id="job-workflow-form" class="form-stack">${error ? `<p class="login-error" role="alert">${e(error)}</p>` : ""}${body}</form>`,
      "wide",
      "workflow-cancel",
      button("cancel", "Cancel") +
        button("save", busy ? "Saving…" : "Save changes"),
    );
  }
  async function handle(el) {
    const action = el.dataset.action;
    if (!action?.startsWith("workflow-")) return false;
    const type = action.slice(9);
    if (type === "cancel") {
      if (!busy) {
        modal = null;
        pending = null;
        render();
      }
      return true;
    }
    if (
      !(type === "create" || (type === "save" && modal?.type === "create")
        ? ctx.canManageJobCreation()
        : manager())
    ) {
      ctx.toast("Current management permission is required.", "error");
      return true;
    }
    if (type !== "save") {
      modal = { type, id: el.dataset.id };
      error = "";
      pending = null;
      render();
      return true;
    }
    if (busy || !modal) return true;
    const form = ctx.$("#job-workflow-form");
    if (!form.reportValidity()) return true;
    const v = Object.fromEntries(new FormData(form)),
      job = ctx.jobOf(modal.id);
    busy = true;
    error = "";
    try {
      if (
        modal.type === "create" &&
        (!v.customer?.trim() ||
          !Number.isFinite(new Date(v.installationDate).getTime()))
      )
        throw Error("Customer and a valid scheduled date are required.");
      if (modal.type === "product" && v.priceConfirmed !== "on")
        throw Error(
          "Confirm the variation price before saving product changes.",
        );
      if (!v.reason?.trim()) throw Error("Enter a reason.");
      let payload = { ...v };
      let operation = modal.type;
      if (operation === "product") {
        const p = ctx.state.products.find((x) => x.id === v.productId);
        payload = {
          ...payload,
          id: v.lineId || undefined,
          productId: p?.id,
          name: p?.name,
          sku: p?.sku,
          quantityRequired: Number(v.quantityRequired),
          unitGross: Number(v.unitGross),
          cancelled: v.cancelled === "true",
          priceConfirmed: v.priceConfirmed === "on",
          dependentTaskIds: new FormData(form).getAll("dependentTaskIds"),
        };
      }
      if (operation === "stage")
        payload = {
          ...payload,
          id: v.stageId || undefined,
          applicable: v.applicable !== "false",
          requiresStock: v.requiresStock === "on",
        };
      if (!pending)
        pending = {
          id: crypto.randomUUID(),
          payload,
          revision: job?.workflowRevision || 0,
        };
      else if (JSON.stringify(pending.payload) !== JSON.stringify(payload))
        throw Error(
          "Retry the unchanged operation, or cancel and reopen before changing its inputs.",
        );
      await prepare?.();
      let result;
      if (backend)
        result = await backend.command(
          job?.id || `job-${pending.id}`,
          pending.revision,
          operation,
          payload,
          pending.id,
        );
      else {
        let j = job
          ? structuredClone(job)
          : {
              id: `job-${pending.id}`,
              number: `JOB-${Date.now()}`,
              customer: v.customer,
              phone: v.phone,
              address: v.address,
              postcode: v.postcode,
              service: v.workType,
              workType: v.workType,
              installerId: v.installerId,
              installationDate: new Date(v.installationDate).toISOString(),
              status: "Confirmed",
              items: [],
              timeline: [],
              photos: [],
              value: 0,
              outstanding: 0,
              workflowVersion: 1,
            };
        if (operation === "product")
          j = updateProduct(j, payload, {
            id: pending.id,
            reason: v.reason,
            actor: ctx.currentUser().id,
          });
        if (operation === "stage")
          j = editStage(j, payload, {
            id: `stage-${pending.id}`,
            reason: v.reason,
            actor: ctx.currentUser().id,
          });
        result = reconcileWorkflow(
          j,
          ctx.state.tasks.filter((t) => t.jobId === j.id),
          {
            managerId: ctx.currentUser().id,
            shortage: stockFacts(j).rows.some((r) => {
              const p = ctx.state.products.find(
                (p) => p.id === r.line.productId,
              );
              return (
                r.outstanding >
                Math.max(0, Number(p?.onHand || 0) - Number(p?.reserved || 0)) +
                  r.reserved
              );
            }),
            returns: ctx.state.returns.some(
              (r) =>
                r.jobId === j.id &&
                !["Processed", "Cancelled"].includes(r.status),
            ),
          },
        );
        if (operation === "stage" && v.taskTitle?.trim())
          result.tasks.push({
            id: `stage-task-${pending.id}`,
            jobId: j.id,
            jobStage: payload.id || `stage-${pending.id}`,
            title: v.taskTitle.trim(),
            notes: "",
            assignedTo: v.assignedTo,
            status: "Pending",
            priority: "Normal",
            category: "Operations",
            workflowOrigin: "manual",
            required: true,
            requiredEvidence: v.requiredEvidence,
            requiresStock: payload.requiresStock,
          });
        if (operation === "product" && payload.dependentTaskIds?.length) {
          const lineId = payload.id || pending.id;
          result.tasks.forEach((t) => {
            if (payload.dependentTaskIds.includes(t.id)) {
              t.requiresStock = true;
              t.dependsOnItemIds = [
                ...new Set([...(t.dependsOnItemIds || []), lineId]),
              ];
            }
          });
        }
        result.job.workflowRevision = (job?.workflowRevision || 0) + 1;
        result.job.timeline.unshift({
          id: pending.id,
          title: `Job ${operation} changed`,
          detail: v.reason,
          at: new Date().toISOString(),
          userId: ctx.currentUser().id,
        });
      }
      apply(result);
      modal = null;
      pending = null;
      ctx.toast("Job workflow saved.");
    } catch (f) {
      error = f.message;
    } finally {
      busy = false;
      render();
    }
    return true;
  }
  ctx.root.addEventListener("change", onChange);
  function onChange(event) {
    if (!modal || busy) return;
    const el = event.target;
    if (el.name === "lineId") {
      modal.lineId = el.value;
      render();
    }
    if (el.name === "stageId") {
      modal.stageId = el.value;
      render();
    }
  }
  const conversions = new Map();
  async function fromQuote(quote) {
    if (busy) return;
    if (!quote || !ctx.canManageJobCreation())
      return ctx.toast("Current management permission is required.", "error");
    const linked = ctx.state.jobs.find((j) => j.quoteId === quote.id);
    if (linked) {
      apply({
        job: linked,
        tasks: ctx.state.tasks.filter((t) => t.jobId === linked.id),
      });
      render();
      return;
    }
    busy = true;
    try {
      await prepare?.();
      let command = conversions.get(quote.id);
      if (!command) {
        command = {
          id: crypto.randomUUID(),
          payload: {
            quoteId: quote.id,
            reason: "Create job from accepted quotation",
            installerId:
              ctx.state.users.find(
                (u) => u.role === "installer" && u.status === "Active",
              )?.id || "",
          },
        };
        conversions.set(quote.id, command);
      }
      const result = await backend.command(
        `job-${command.id}`,
        0,
        "from_quote",
        command.payload,
        command.id,
      );
      apply(result);
      conversions.delete(quote.id);
      ctx.toast("Job created from the accepted quotation.");
    } catch (f) {
      ctx.toast(f.message, "error");
    } finally {
      busy = false;
      render();
    }
  }
  async function reopen(id, reason, target) {
    if (busy) return;
    busy = true;
    try {
      await prepare?.();
      const j = ctx.jobOf(id);
      const key = `reopen:${id}`;
      let op = conversions.get(key);
      if (!op) {
        op = {
          id: crypto.randomUUID(),
          payload: { reason, target },
          revision: j.workflowRevision || 0,
        };
        conversions.set(key, op);
      }
      if (op.payload.reason !== reason || op.payload.target !== target)
        throw Error(
          "Retry the same reopening reason or reload before changing it.",
        );
      apply(
        await backend.command(id, op.revision, "reopen", op.payload, op.id),
      );
      conversions.delete(key);
      ctx.toast("Job reopened; fresh completion and approval are required.");
    } catch (f) {
      ctx.toast(f.message, "error");
    } finally {
      busy = false;
      render();
    }
  }
  return {
    reopen,
    fromQuote,
    controls,
    renderModal,
    handle,
    dispose: () => ctx.root.removeEventListener("change", onChange),
  };
}
