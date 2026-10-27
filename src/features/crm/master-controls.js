import {
  impersonationId,
  setImpersonation,
  impersonationReturnPath,
} from "./impersonation.js";

export function createMasterControls({
  backend,
  ctx,
  lifecycle,
  access,
  accounts,
  render,
  revalidate,
  navigate = (path) => location.assign(path),
}) {
  let data = null,
    error = "",
    message = "",
    loading = false,
    busy = false,
    scope = "global",
    target = "",
    preview = "",
    modal = null,
    startingId = "";
  const e = ctx.esc;
  const owner = () =>
    access()?.profile.role === "super_admin" &&
    access()?.modules.some((m) => m.key === "master_control" && m.can_view);
  const button = (action, label, id = "", extra = "") =>
    `<button type="button" class="btn ghost sm" data-action="master-${action}" data-id="${e(id)}" ${extra} ${busy ? "disabled" : ""}>${e(label)}</button>`;
  const staff = () => accounts().filter((a) => a.role !== "super_admin");
  const roles = () =>
    data?.roles.filter((r) => r.key !== "super_admin" && r.active !== false) ||
    [];
  const role = () => roles().find((r) => r.id === target);
  const notice = () =>
    `${error ? `<p class="login-error" role="alert">${e(error)}</p>` : ""}${message ? `<p class="form-note" role="status">${e(message)}</p>` : ""}${data?.deployment_pending ? '<p class="form-note" role="status">The focused access extension is pending deployment. Existing module controls work; new overrides, tab rules and effective previews require that migration.</p>' : ""}`;
  async function refresh() {
    if (loading || !owner() || lifecycle.disposed) return;
    loading = true;
    try {
      data = await backend.load(
        scope === "user" ? target || null : preview || null,
        scope === "role" && !preview ? role()?.key || null : null,
      );
      error = "";
    } catch (f) {
      error = f.message;
    } finally {
      loading = false;
      if (!lifecycle.disposed) render();
    }
  }
  function ready() {
    if (!owner())
      return '<div class="card empty">Super Admin sign-in required.</div>';
    if (!data && !loading && !error) void refresh();
    return data
      ? ""
      : `<section class="card card-pad">${notice()}<p>${loading ? "Loading Master Control…" : "Master Control could not load."}</p>${button("refresh", "Retry")}</section>`;
  }
  function dropdown(kind, mid, action, value, labels, pending = false) {
    return `<select class="select" aria-label="${e(kind)} · ${e(mid)}${action ? `.${e(action)}` : ""}" data-master-control="${kind}" data-module="${e(mid)}" data-key="${e(action)}" ${busy || pending ? "disabled" : ""}>${labels.map(([id, label]) => `<option value="${e(id)}" ${value === id ? "selected" : ""}>${e(label)}</option>`).join("")}</select>`;
  }
  const effects = [
    ["default", "Inherit / Default"],
    ["allow", "Allow"],
    ["deny", "Deny"],
  ];
  const matches = (r, mid, kind, action) =>
    r.module_id === mid &&
    r.scope_type === scope &&
    (scope === "global" ||
      (scope === "role" ? r.role_id === target : r.user_id === target)) &&
    (!kind || r.rule_kind === kind) &&
    (!action || r.action === action);
  function ordinary(pe) {
    if (scope === "global")
      return (
        data.rules.find((r) =>
          matches(r, pe.module_id, "global_permission", pe.action),
        )?.effect || "default"
      );
    return (
      (scope === "role" ? data.role_permissions : data.user_permissions).find(
        (r) =>
          r.permission_id === pe.id &&
          (scope === "role" ? r.role_id === target : r.user_id === target),
      )?.effect || "default"
    );
  }
  function renderAccess() {
    const pending = ready();
    if (pending) return pending;
    const selected = scope !== "global" && !target;
    const view = ctx.ui.accessView || "Modules";
    return `${ctx.header("SUPER ADMIN", "Master Control", "Control every registered module and action using global, role and profile rules.")}${notice()}<section class="card card-pad"><div class="form-grid"><div class="field"><label for="master-scope">Apply controls to</label><select class="select" id="master-scope" data-master-scope ${busy ? "disabled" : ""}><option value="global" ${scope === "global" ? "selected" : ""}>Global · ordinary users</option><option value="role" ${scope === "role" ? "selected" : ""}>Role</option><option value="user" ${scope === "user" ? "selected" : ""}>Individual profile</option></select></div>${scope !== "global" ? `<div class="field"><label for="master-target">${scope === "role" ? "Role" : "Profile"}</label><select class="select" id="master-target" data-master-target ${busy ? "disabled" : ""}><option value="">Select…</option>${(scope === "role" ? roles().map((r) => ({ id: r.id, name: r.name })) : staff().map((a) => ({ id: a.id, name: a.full_name || a.email }))).map((r) => `<option value="${e(r.id)}" ${target === r.id ? "selected" : ""}>${e(r.name)}</option>`).join("")}</select></div>` : ""}<div class="field"><label for="master-preview">Effective access for</label><select id="master-preview" class="select" data-master-preview ${scope === "user" || busy ? "disabled" : ""}><option value="">${scope === "role" ? "An active member of this role" : "Choose a profile"}</option>${staff()
      .map(
        (a) =>
          `<option value="${e(a.id)}" ${(scope === "user" ? target : preview) === a.id ? "selected" : ""}>${e(a.full_name || a.email)} · ${e(a.role)}</option>`,
      )
      .join(
        "",
      )}</select></div></div>${data.preview_user_id ? `<p class="small muted">Preview account: ${e(accounts().find((a) => a.id === data.preview_user_id)?.full_name || data.preview_user_id)}. Individual rules are included in this result.</p>` : ""}<p class="small muted">Ordinary grants remain subject to restrictions. Explicit Super Admin overrides bypass restrictions only for the selected action and its view prerequisite. Individual overrides precede role overrides; an equal-scope view denial blocks dependent actions.</p></section><section class="card card-pad mt16"><div class="tabs">${["Modules", "Functions"].map((name) => `<button class="tab ${view === name ? "active" : ""}" data-action="master-access-view" data-view="${name}">${name}</button>`).join("")}</div><div class="row wrap gap8 mt12">${button("editor-bulk", "Enable all", "enable", selected || data.deployment_pending ? "disabled" : "")}${button("editor-bulk", "Disable all", "disable", selected || data.deployment_pending ? "disabled" : "")}${button("editor-bulk", "Restore defaults", "default", selected || data.deployment_pending ? "disabled" : "")}</div></section>${data.modules
      .filter((m) => m.key !== "master_control")
      .map((m) => {
        const state =
          data.module_rules
            .filter((r) => matches(r, m.id))
            .sort((a, b) =>
              String(b.updated_at).localeCompare(String(a.updated_at)),
            )[0]?.access_state || "default";
        const tab =
          data.rules.find((r) => matches(r, m.id, "tab", "view"))?.effect ||
          "default";
        const effective = data.effective?.find((row) => row.key === m.key);
        return `<section class="card card-pad mt16"><h3>${e(m.name)}${m.is_active === false ? " · Registry disabled" : ""}</h3>${
          view === "Modules"
            ? `<div class="form-grid"><div class="field"><label>Module access</label>${dropdown(
                "module",
                m.key,
                "",
                state,
                [
                  ["default", "Inherit / Default"],
                  ["enabled", "Enabled"],
                  ["readonly", "Read only"],
                  ["disabled", "Disabled"],
                  ["locked", "Locked"],
                ],
                selected,
              )}</div><div class="field"><label>Tab visibility</label>${dropdown(
                "tab",
                m.key,
                "view",
                tab,
                [
                  ["default", "Inherit / Default"],
                  ["allow", "Show tab"],
                  ["deny", "Hide tab"],
                ],
                selected || data.deployment_pending,
              )}</div></div>`
            : ""
        }<p class="small muted">Effective module: ${effective ? `${effective.can_view ? "View allowed" : "View denied"} · ${e(effective.state)} · ${effective.tab_visible ? "Tab shown" : "Tab hidden"}` : "Select a profile for an authoritative preview."}</p>${(view ===
        "Functions"
          ? data.permissions
          : []
        )
          .filter((p) => p.module_id === m.id)
          .map((pe) => {
            const rule = data.rules.find((r) =>
              matches(r, m.id, "override", pe.action),
            );
            const d = effective?.decisions?.[pe.action];
            return `<div class="permission-row"><div class="grow"><strong>${e(pe.description || pe.action)}</strong><div class="small muted">${e(pe.key)} · ${d ? `${d.allowed ? "Allowed" : "Denied"} · ${e(d.source)}` : "Effective access not previewed"}${d?.rule_id ? ` · Rule ${e(d.rule_id)}` : ""}</div></div><div class="form-grid"><div class="field"><label>Ordinary permission</label>${dropdown("permission", m.key, pe.action, ordinary(pe), effects, selected || (scope === "global" && data.deployment_pending))}</div>${scope !== "global" ? `<div class="field"><label>Explicit Super Admin override</label>${dropdown("override", m.key, pe.action, rule?.effect || "default", effects, selected || data.deployment_pending)}</div>` : ""}</div></div>`;
          })
          .join("")}</section>`;
      })
      .join("")}`;
  }
  function renderUltimate() {
    const pending = ready();
    if (pending) return pending;
    const locked = data.system_locks.some(
      (l) =>
        l.is_locked &&
        l.scope === "global" &&
        (!l.starts_at || Date.parse(l.starts_at) <= Date.now()) &&
        (!l.ends_at || Date.parse(l.ends_at) > Date.now()),
    );
    return `${ctx.header("SUPER ADMIN", "Ultimate access & control", "Control staff roles, global restrictions and recovery access.")}${notice()}<section class="card card-pad"><h3>Global restrictions</h3><p>${locked ? "Workspace lock is active. Scoped explicit overrides remain effective." : "Workspace is available subject to each module's rules."}</p>${button("system-lock", locked ? "Unlock workspace" : "Lock workspace", locked ? "false" : "true", data.deployment_pending ? "disabled" : "")}</section><section class="card card-pad mt16"><h3>Role-wide access</h3><div class="row wrap gap8"><select class="select" id="master-bulk-role" aria-label="Role-wide access">${roles()
      .map((r) => `<option value="${e(r.id)}">${e(r.name)}</option>`)
      .join(
        "",
      )}</select>${button("bulk", "Grant explicit full staff access", "grant", data.deployment_pending ? "disabled" : "")}${button("bulk", "Hide all modules / disable functions", "hide", data.deployment_pending ? "disabled" : "")}${button("bulk", "Restore role defaults", "default", data.deployment_pending ? "disabled" : "")}</div><p class="small muted">Full access is an explicit override for registered staff actions. Restore removes this scope's module, tab and explicit override rules; ordinary permissions remain.</p></section><section class="card card-pad mt16"><h3>Global module locks</h3><div class="permission-grid">${data.modules
      .filter((m) => m.key !== "master_control")
      .map((m) => {
        const rule = data.module_rules.find(
          (r) =>
            r.module_id === m.id &&
            r.scope_type === "global" &&
            ["locked", "disabled"].includes(r.access_state),
        );
        return `<div class="permission-row"><strong class="grow">${e(m.name)}</strong>${button("module-lock", rule ? "Unlock" : "Lock", m.key, `data-state="${rule ? "default" : "locked"}"`)}</div>`;
      })
      .join(
        "",
      )}</div></section><section class="card card-pad mt16"><h3>Individual profiles</h3>${staff()
      .map(
        (a) =>
          `<div class="list-row"><div class="grow"><strong>${e(a.full_name || a.email)}</strong><p>${e(a.role)} · ${e(a.status)}</p></div>${button("profile-role", "Change role", a.id)}${button("profile-bulk", "Full access", a.id, `data-mode="grant" ${data.deployment_pending ? "disabled" : ""}`)}${button("profile-bulk", "Hide all / disable all", a.id, `data-mode="hide" ${data.deployment_pending ? "disabled" : ""}`)}${button("profile-bulk", "Restore defaults", a.id, `data-mode="default" ${data.deployment_pending ? "disabled" : ""}`)}${button("profile-permissions", "Per-tab / function controls", a.id)}</div>`,
      )
      .join("")}</section>`;
  }
  function renderSecurity() {
    const pending = ready();
    if (pending) return pending;
    return `<section class="card card-pad mt16"><h3>Impersonation verification</h3><p>Login as user uses your verified Super Admin session. Your configured account authentication remains unchanged.</p>${button("enroll-mfa", "Set up an authenticator")}</section><section class="card card-pad mt16"><h3>Active impersonation sessions</h3><p class="small muted">End a stranded session here if its start response was lost. This keeps the existing audit record.</p>${button("refresh", "Refresh sessions")}${(data.active_impersonations || []).map((i) => `<div class="list-row"><div class="grow"><strong>${e(accounts().find((a) => a.id === i.effective_actor_user_id)?.full_name || i.effective_actor_user_id)}</strong><p class="small muted">${e(i.reason)} · Expires ${e(i.expires_at)}</p></div>${button("end-session", "End session", i.id)}</div>`).join("") || `<p class="small muted">No active sessions.</p>`}</section>`;
  }
  function renderModal() {
    if (!modal) return "";
    const target = accounts().find((a) => a.id === modal.id);
    if (modal.type === "mfa")
      return ctx.modalFrame(
        "Set up an authenticator",
        "Scan the QR code with your authenticator app.",
        `<form id="master-form"><img alt="Authenticator setup QR code" width="240" height="240" src="${e(modal.qr.startsWith("data:image/svg+xml") ? modal.qr : `data:image/svg+xml,${encodeURIComponent(modal.qr)}`)}"><div class="field"><label for="master-code">Authenticator code</label><input id="master-code" name="code" class="input" autocomplete="one-time-code"></div>${notice()}</form>`,
        "",
        "master-cancel",
        button("cancel", "Close") + button("confirm", "Verify authenticator"),
      );

    const input = (name, label, type = "text") =>
      `<div class="field"><label for="master-${name}">${e(label)}</label><input id="master-${name}" name="${name}" type="${type}" class="input" ${busy ? "disabled" : ""}></div>`;
    const body = `<p>Change the global workspace lock? Explicit scoped overrides and the owner's recovery controls remain available.</p>${input("title", "Lock title")}${input("message", "Lock message")}`;
    return ctx.modalFrame(
      "Global workspace lock",
      target?.email || "",
      `<form id="master-form" class="form-stack">${notice()}${body}</form>`,
      "",
      "master-cancel",
      button("cancel", "Cancel") +
        button("confirm", busy ? "Saving…" : "Confirm"),
    );
  }
  async function mutate(work) {
    if (busy) return;
    busy = true;
    error = "";
    message = "";
    render();
    let failure = "";
    try {
      if (!owner()) throw new Error("Super Admin required");
      await work();
      message = "Change confirmed by the backend.";
    } catch (f) {
      failure = f.message;
    } finally {
      busy = false;
      await revalidate();
      await refresh();
      if (failure) error = failure;
      if (!lifecycle.disposed) render();
    }
  }
  async function handle(el) {
    const action = el.dataset.action;
    if (
      action === "end-impersonation" ||
      (action === "logout" && access()?.impersonation)
    ) {
      if (busy) return true;
      busy = true;
      try {
        await backend.end(access()?.impersonation?.id || impersonationId());
        await ctx.prepareIdentityChange?.();
        const returnTo = impersonationReturnPath();
        setImpersonation("");
        if (action === "logout") return false;
        navigate(returnTo);
      } catch (f) {
        ctx.toast(f.message, "error");
      } finally {
        busy = false;
      }
      return true;
    }
    if (
      !action?.startsWith("master-") ||
      ["master-view", "master-open-request"].includes(action)
    )
      return false;
    const type = action.slice(7);
    if (type === "refresh") {
      error = "";
      await refresh();
      return true;
    }
    if (type === "cancel") {
      if (!busy && modal?.type === "mfa") {
        await mutate(async () => {
          await backend.cancelMFA(modal.id);
          modal = null;
        });
        return true;
      }
      if (!busy) {
        modal = null;
        render();
      }
      return true;
    }
    if (type === "profile-permissions" || type === "user-access") {
      scope = "user";
      target = el.dataset.id;
      preview = "";
      ctx.ui.masterView = "Access controls";
      ctx.ui.page = "master";
      await refresh();
      return true;
    }
    if (!owner() || busy) return true;
    if (type === "end-session") {
      await mutate(
        () => backend.end(el.dataset.id),
        "Impersonation session ended",
      );
      return true;
    }
    if (type === "enroll-mfa") {
      await mutate(async () => {
        const factor = await backend.enrollMFA();
        modal = { type: "mfa", id: factor.id, qr: factor.qr };
      });
      return true;
    }
    if (type === "impersonate") {
      const account = accounts().find((a) => a.id === el.dataset.id);
      if (
        !account ||
        account.status !== "active" ||
        account.role === "super_admin"
      ) {
        ctx.toast("Choose an active staff account.", "error");
        return true;
      }
      busy = true;
      startingId = account.id;
      error = "";
      render();
      try {
        const id = await backend.start(account.id);
        await ctx.prepareIdentityChange?.();
        setImpersonation(
          id,
          ctx.ui.page === "users" ? "/crm/users" : "/crm/master",
        );
        navigate("/crm/dashboard");
      } catch (failure) {
        error = failure.message;
        ctx.toast(failure.message, "error");
      } finally {
        busy = false;
        startingId = "";
        if (!lifecycle.disposed) render();
      }
      return true;
    }
    if (type === "system-lock") {
      modal = { type, id: el.dataset.id };
      error = "";
      render();
      return true;
    }
    if (type === "confirm" && modal) {
      const values = Object.fromEntries(new FormData(ctx.$("#master-form")));
      const selected = modal;
      if (selected.type === "mfa") {
        await mutate(async () => {
          await backend.verifyMFA(selected.id, String(values.code || ""));
          modal = null;
        });
      } else
        await mutate(async () => {
          await backend.lock(
            selected.id === "true",
            String(values.title || ""),
            String(values.message || ""),
          );
          modal = null;
        });
      return true;
    }
    if (type === "module-lock") {
      await mutate(() =>
        backend.module(el.dataset.id, "global", null, el.dataset.state),
      );
      return true;
    }
    if (type === "profile-role") {
      await ctx.accountControls.handle({
        dataset: { action: "account-role", id: el.dataset.id },
      });
      return true;
    }
    if (type === "profile-bulk") {
      await mutate(() => backend.bulk("user", el.dataset.id, el.dataset.mode));
      return true;
    }
    if (type === "editor-bulk") {
      await mutate(() =>
        backend.bulk(
          scope,
          scope === "global" ? null : target,
          el.dataset.id,
          ctx.ui.accessView === "Functions" ? "permission" : "module",
        ),
      );
      return true;
    }
    if (type === "bulk") {
      const id = ctx.$("#master-bulk-role")?.value;
      await mutate(() => backend.bulk("role", id, el.dataset.id));
      return true;
    }
    return false;
  }
  lifecycle.listen(ctx.root, "change", async (event) => {
    const el = event.target;
    if (
      el.matches(
        "[data-master-scope],[data-master-target],[data-master-preview]",
      )
    ) {
      if (busy) return;
      if (el.matches("[data-master-scope]")) {
        scope = el.value;
        target = "";
        preview = "";
      }
      if (el.matches("[data-master-target]")) target = el.value;
      if (el.matches("[data-master-preview]")) preview = el.value;
      await refresh();
      return;
    }
    const kind = el.dataset.masterControl;
    if (!kind) return;
    const mid = el.dataset.module,
      key = el.dataset.key,
      value = el.value,
      targetId = scope === "global" ? null : target;
    await mutate(async () => {
      if (scope !== "global" && !target)
        throw new Error("Choose a role or profile");
      if (kind === "module") await backend.module(mid, scope, targetId, value);
      else if (kind === "permission" && scope !== "global")
        await backend.permission(
          scope,
          scope === "role" ? role().key : targetId,
          `${mid}.${key}`,
          value,
        );
      else
        await backend.rule(
          kind === "permission" ? "global_permission" : kind,
          scope,
          targetId,
          mid,
          key,
          value,
        );
    });
  });
  lifecycle.listen(ctx.root, "submit", (event) => {
    if (event.target.id === "master-form") {
      event.preventDefault();
      void handle({ dataset: { action: "master-confirm" } });
    }
  });
  return {
    isBusy: () => busy,
    startingUser: () => startingId,
    renderAccess,
    renderUltimate,
    renderSecurity,
    renderModal,
    handle,
    refresh,
  };
}
