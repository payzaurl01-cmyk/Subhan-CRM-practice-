import { canApproveJobs, sameReviewedWork } from "./job-approval-backend.js";

export function createJobApprovalControls({
  backend,
  ctx,
  lifecycle,
  access,
  beforeReview,
  onData,
  render,
}) {
  let snapshot = { jobs: [], history: [], notifications: [] };
  let failure = "";
  let pending;
  let busy = false;
  let review = null;
  const notes = new Map();
  const seenNotifications = new Set();
  let notificationsLoaded = false;
  const esc = ctx.esc;
  const find = (id) => snapshot.jobs.find((row) => row.job_id === id);

  async function refresh() {
    if (lifecycle.disposed) return;
    if (pending) return pending;
    pending = (async () => {
      try {
        const fresh = await backend.load();
        if (lifecycle.disposed) return;
        const changed =
          failure || JSON.stringify(fresh) !== JSON.stringify(snapshot);
        for (const notification of fresh.notifications) {
          if (
            notificationsLoaded &&
            !seenNotifications.has(notification.id) &&
            !notification.read_at
          )
            ctx.toast(`${notification.title}: ${notification.body}`);
          seenNotifications.add(notification.id);
        }
        notificationsLoaded = true;
        snapshot = fresh;
        failure = "";
        const workChanged = onData(fresh);
        if (changed || workChanged) render();
        return true;
      } catch (error) {
        if (!lifecycle.disposed) {
          failure = error.message;
          snapshot = { jobs: [], history: [], notifications: [] };
          render();
        }
        return false;
      } finally {
        pending = null;
      }
    })();
    return pending;
  }
  function status(job) {
    if (job.status !== "Completed") return "Not Ready";
    const row = find(job.id);
    return sameReviewedWork(job, row?.job)
      ? row.approval_status
      : "Pending Approval";
  }
  async function refreshCurrent() {
    // Finish a read started before a mutation, then request its committed state.
    if (pending) await pending;
    return refresh();
  }
  function summary(job) {
    const row = find(job.id);
    if (status(job) !== "Approved") return "";
    return `<div class="form-note mt16" data-job-approval><strong>Approved by ${esc(row.reviewer_name || ctx.userName(row.approved_by))}</strong><p>${esc(ctx.fmt(row.approved_at, true))}</p>${row.review_notes ? `<p>${esc(row.review_notes)}</p>` : ""}</div>`;
  }
  function reviewPanel(job) {
    const row = find(job.id);
    const history = snapshot.history.filter((h) => h.job_id === job.id);
    const changed =
      review?.id !== job.id ||
      review?.revision !== row?.revision ||
      !sameReviewedWork(job, row?.job);
    const can = canApproveJobs(access());
    const returns = [
      ...ctx.state.returns,
      ...(snapshot.inventory_returns || []),
    ].filter((r) => r.jobId === job.id);
    const photos = job.photos || [];
    const returnDetails = (r) =>
      `<div class="form-note mt8"><strong>${esc(r.number || r.id)}</strong> ${ctx.badge(r.status)}<p>${esc(r.reason || r.condition || "")} · ${(r.items || []).length} line(s)</p>${r.source === "inventory" ? `<p class="small">Warehouse return · Delivered: ${esc(ctx.fmt(r.delivered_at, true))} · Inspected: ${esc(ctx.fmt(r.processed_at, true))}</p>${r.items.map((item) => `<p class="small">${esc(ctx.state.products.find((p) => p.id === item.variant_id)?.name || item.variant_id || "Product")} · Returned ${esc(item.quantity)} · Usable ${esc(item.usable_quantity ?? "Not inspected")} · Damaged ${esc(item.damaged_quantity ?? "Not inspected")}</p>`).join("")}` : `<button class="btn secondary sm" data-action="open-approved-return" data-id="${ctx.attr(r.id)}">Inspect return</button>`}</div>`;
    return `<section class="card card-pad mt16" data-job-review><h3>Completion review</h3><div class="row wrap gap8 mt12">${ctx.jobBadges(job)}</div>${failure ? `<p class="login-error" role="alert">${esc(failure)}</p>` : ""}${summary(job)}
      <h4 class="mt16">Completed tasks</h4>${ctx.renderJobStageTasks(job)}
      <h4 class="mt16">Before / earlier evidence</h4>${photos.length ? `<div class="photo-grid">${photos.map((p) => `<div class="photo-card"><img src="${ctx.attr(p.uri)}" alt="${ctx.attr(p.type || "Before")} evidence"><p>${esc(p.type || "Earlier photo")} · ${esc(ctx.fmt(p.createdAt, true))}</p></div>`).join("")}</div>` : '<p class="small muted">No earlier photos recorded.</p>'}
      <h4 class="mt16">After evidence and device location</h4>${ctx.renderInstallationProof(job)}
      <h4 class="mt16">Relevant returns</h4>${returns.length ? returns.map(returnDetails).join("") : '<p class="small muted">No returns recorded.</p>'}
      ${job.status !== "Completed" ? '<p class="form-note mt16">Complete this job before approval.</p>' : status(job) === "Approved" ? "" : !can ? '<p class="form-note mt16">Approval requires an authorized Admin, Manager or Super Admin.</p>' : `<div class="field mt16"><label for="job-review-notes">Review notes (optional)</label><textarea class="textarea" id="job-review-notes" maxlength="4000" data-review-notes="${ctx.attr(job.id)}" data-focus="job-review-notes">${esc(notes.get(job.id) || "")}</textarea></div>${changed ? '<p class="form-note" role="status">Load the current job and inspect its evidence before approving.</p>' : ""}<div class="row gap8 mt12"><button class="btn secondary" data-action="approval-review" data-id="${ctx.attr(job.id)}" ${busy ? "disabled" : ""}>Refresh review</button><button class="btn" data-action="approval-approve" data-id="${ctx.attr(job.id)}" data-revision="${review?.revision || ""}" ${busy || changed || failure || !row ? "disabled" : ""}>${busy ? "Approving…" : "Approve Job"}</button></div>`}
      <h4 class="mt16">Approval history</h4>${history.length ? history.map((h) => `<div class="form-note mt8"><strong>${esc(h.reviewer_name)}</strong> · ${esc(ctx.fmt(h.approved_at, true))}<p>${esc(h.review_notes || "No review notes")}</p>${h.invalidated_at ? `<p>Invalidated ${esc(ctx.fmt(h.invalidated_at, true))}: ${esc(h.invalidation_reason)}</p>` : "<p>Current approval</p>"}</div>`).join("") : '<p class="small muted">No approvals recorded.</p>'}</section>`;
  }
  async function handle(el) {
    const { action, id } = el.dataset;
    if (!["approval-review", "approval-approve"].includes(action)) return false;
    if (busy) return true;
    try {
      if (!(await beforeReview()))
        throw new Error("Save current changes before reviewing this job");
      if (action === "approval-review") {
        if (!(await refreshCurrent())) return true;
        const job = ctx.jobOf(id);
        if (!job || !ctx.canViewJob(job))
          throw new Error("Job is not available");
        review = { id, revision: find(id)?.revision };
        ctx.ui.modal = { type: "job", id };
        ctx.ui.jobTab = "review";
        render();
      } else {
        if (!canApproveJobs(access()))
          throw new Error("jobs.approve permission required");
        busy = true;
        render();
        await backend.approve(
          id,
          Number(el.dataset.revision),
          notes.get(id) || "",
        );
        notes.delete(id);
        const refreshed = await refreshCurrent();
        ctx.toast(
          refreshed
            ? "Job approval confirmed by the backend."
            : `Approval saved. Refresh failed: ${failure}`,
          refreshed ? "success" : "error",
        );
      }
    } catch (error) {
      ctx.toast(error.message, "error");
      // A lost response may follow a committed approval. Reconcile without
      // retrying a mutation; the server also deduplicates the job revision.
      await refreshCurrent();
    } finally {
      busy = false;
      render();
    }
    return true;
  }
  const stop = backend.watch(() => void refresh());
  lifecycle.listen(window, "focus", () => void refresh());
  lifecycle.listen(window, "online", () => void refresh());
  lifecycle.listen(document, "visibilitychange", () => {
    if (!document.hidden) void refresh();
  });
  lifecycle.listen(ctx.root, "input", (event) => {
    if (event.target.matches("[data-review-notes]"))
      notes.set(event.target.dataset.reviewNotes, event.target.value);
  });
  lifecycle.setInterval(() => void refresh(), 30000);
  void refresh();
  return {
    status,
    summary,
    reviewPanel,
    handle,
    refresh,
    approved: (id) => {
      const job = ctx.jobOf(id);
      return job && status(job) === "Approved" ? find(id) : null;
    },
    get failure() {
      return failure;
    },
    notifications: () =>
      snapshot.notifications
        .filter((n) => n.event === "approved" || canApproveJobs(access()))
        .map((n) => ({
          ...n,
          jobId: n.job_id,
          page: "jobs",
          createdAt: n.created_at,
          read: !!n.read_at,
          approvalNotification: true,
        })),
    async read(id) {
      await backend.read(id);
      await refreshCurrent();
    },
    dispose() {
      stop();
      notes.clear();
    },
  };
}
