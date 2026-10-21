import {
  ACCOUNT_PERMISSIONS,
  isProtectedAccount,
  usersModule,
} from "./accounts-backend.js";

export function createAccountControls({
  backend,
  initial,
  ctx,
  lifecycle,
  render,
  onAccess,
  onFailure,
}) {
  let snapshot = initial;
  let modal = null;
  let busy = false;
  let pending = null;
  let refreshAgain = false;
  let refreshFailed = false;
  let permissionUser = "";
  let message = "";
  let failed = false;
  const esc = ctx.esc;
  const can = (action) =>
    usersModule(snapshot.context)?.[`can_${action}`] === true;
  const superAdmin = () => snapshot.context.profile.role === "super_admin";
  const find = (id) => snapshot.accounts.find((account) => account.id === id);
  const disabled = () => (busy ? "disabled" : "");
  const notice = () =>
    message
      ? `<div class="${failed ? "login-error" : "form-note"}" role="${failed ? "alert" : "status"}">${esc(message)}</div>`
      : "";

  async function refresh() {
    if (lifecycle.disposed) return;
    if (pending) {
      refreshAgain = true;
      return pending;
    }
    pending = (async () => {
      try {
        const context = await backend.context();
        const [accounts, rules] = await Promise.all([
          backend.list(context),
          backend.permissionRules(context),
        ]);
        if (lifecycle.disposed) return;
        const changed =
          JSON.stringify(snapshot) !==
          JSON.stringify({
            context: {
              ...context,
              generated_at: snapshot.context.generated_at,
            },
            accounts,
            rules,
          });
        const revoked =
          JSON.stringify(snapshot.context.modules) !==
            JSON.stringify(context.modules) ||
          snapshot.context.profile.role !== context.profile.role;
        snapshot = { context, accounts, rules };
        if (revoked) modal = null;
        onAccess(snapshot);
        if (changed || refreshFailed) render();
        refreshFailed = false;
      } catch (error) {
        refreshFailed = true;
        if (!lifecycle.disposed) onFailure(error);
      } finally {
        pending = null;
      }
    })();
    await pending;
    if (refreshAgain && !lifecycle.disposed) {
      refreshAgain = false;
      await refresh();
    }
  }

  function button(action, target, label) {
    return `<button type="button" class="btn ghost sm" data-action="account-${action}" data-id="${esc(target.id)}" ${disabled()}>${esc(label)}</button>`;
  }
  function actions(target) {
    if (isProtectedAccount(target))
      return `<div class="row wrap gap6"><span class="small muted">Protected Super Admin</span>${superAdmin() && can("update") ? button("edit", target, "Edit profile") : ""}${superAdmin() && can("change_password") ? button("password", target, "Change password") : ""}</div>`;
    const self = target.id === snapshot.context.profile.id;
    return `<div class="row wrap gap6">${can("update") ? button("edit", target, "Edit profile") : ""}${can("change_role") && !self ? button("role", target, "Change role") : ""}${can("change_password") ? button("password", target, "Change password") : ""}${can("block") && !self ? button("block", target, target.status === "active" ? "Block" : "Unblock") : ""}${can("delete") && !self ? button("delete", target, "Delete") : ""}</div>`;
  }
  function renderUsers() {
    return `${ctx.header("ACCOUNT MANAGEMENT", "People and access", "Manage accounts using your current permissions.")}${notice()}<div class="card"><div class="table-wrap desktop-table"><table class="data-table"><thead><tr><th>Name / email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${snapshot.accounts.map((target) => `<tr><td><strong>${esc(target.full_name || "Unnamed account")}</strong><div class="secondary-line">${esc(target.email || "")}</div><div class="secondary-line">${esc(target.phone || "")}</div></td><td>${esc(ctx.roleLabel(target.role))}</td><td>${ctx.badge(target.status)}</td><td>${actions(target)}</td></tr>`).join("")}</tbody></table></div><div class="cards-mobile">${snapshot.accounts.map((target) => `<article class="mobile-card"><strong>${esc(target.full_name || "Unnamed account")}</strong><p class="small muted">${esc(target.email || "")} · ${esc(ctx.roleLabel(target.role))}</p>${ctx.badge(target.status)}<div class="mt12">${actions(target)}</div></article>`).join("")}</div></div>${superAdmin() ? renderPermissions() : ""}`;
  }
  const relationKey = (row, key) =>
    (Array.isArray(row[key]) ? row[key][0] : row[key])?.key;
  function renderPermissions() {
    if (!superAdmin()) return "";
    const roleRows = ["admin", "manager"]
      .map(
        (role) =>
          `<section class="card card-pad mt16"><h3>${esc(ctx.roleLabel(role))} permissions</h3>${Object.entries(
            ACCOUNT_PERMISSIONS,
          )
            .map(([key, label]) => {
              const rule = snapshot.rules.roles.find(
                (row) =>
                  relationKey(row, "roles") === role &&
                  relationKey(row, "permissions") === `users.${key}`,
              );
              return `<div class="permission-row"><div class="grow"><strong>${esc(label)}</strong><div class="small muted">${esc(rule?.effect || "No grant")}</div></div><button type="button" class="btn ${rule?.effect === "allow" ? "danger" : "success"} sm" data-action="account-role-permission" data-role="${role}" data-key="${key}" data-effect="${rule?.effect === "allow" ? "deny" : "allow"}" ${disabled()}>${rule?.effect === "allow" ? "Revoke" : "Restore"}</button></div>`;
            })
            .join("")}</section>`,
      )
      .join("");
    const staff = snapshot.accounts.filter(
      (target) => !isProtectedAccount(target),
    );
    if (!staff.some((target) => target.id === permissionUser))
      permissionUser = staff[0]?.id || "";
    const target = find(permissionUser);
    return `<section class="mt16"><h2>Account permissions</h2><p class="small muted">Role revocations override individual grants. Default removes an individual override and restores inherited access.</p>${roleRows}<section class="card card-pad mt16"><h3>Individual overrides</h3><label for="account-permission-user">Account</label><select id="account-permission-user" class="select" data-account-user ${disabled()}>${staff.map((account) => `<option value="${esc(account.id)}" ${account.id === permissionUser ? "selected" : ""}>${esc(account.full_name || account.email)} · ${esc(ctx.roleLabel(account.role))}</option>`).join("")}</select>${
      target
        ? Object.entries(ACCOUNT_PERMISSIONS)
            .map(([key, label]) => {
              const rule = snapshot.rules.users.find(
                (row) =>
                  row.user_id === target.id &&
                  relationKey(row, "permissions") === `users.${key}`,
              );
              return `<div class="permission-row"><div class="grow"><strong>${esc(label)}</strong><div class="small muted">Override: ${esc(rule?.effect || "default")}${rule?.starts_at || rule?.ends_at ? " (scheduled)" : ""}</div></div><div class="row wrap gap6">${["allow", "deny", "default"].map((effect) => `<button type="button" class="btn ghost sm" data-action="account-user-permission" data-id="${esc(target.id)}" data-key="${key}" data-effect="${effect}" ${disabled() || (effect === "allow" && !["admin", "manager"].includes(target.role) ? "disabled" : "")}>${effect}</button>`).join("")}</div></div>`;
            })
            .join("")
        : "<p>No staff accounts available.</p>"
    }</section></section>`;
  }

  function renderModal() {
    const target = modal && find(modal.id);
    if (!target) return "";
    const input = (name, label, value = "", type = "text") =>
      `<div class="field"><label for="account-${name}">${label}</label><input id="account-${name}" class="input" name="${name}" type="${type}" value="${esc(value)}" ${type === "password" ? 'minlength="12" maxlength="1024" autocomplete="new-password" required' : ""} ${disabled()}></div>`;
    let body = "";
    if (modal.type === "edit")
      body =
        input("full_name", "Full name", target.full_name || "") +
        input("phone", "Phone", target.phone || "") +
        `<p class="small muted">Sign-in email: ${esc(target.email)}. Changes here update profile details.</p>`;
    if (modal.type === "role")
      body = `<div class="field"><label for="account-role">Role</label><select id="account-role" name="role" class="select" ${disabled()}>${["admin", "manager", "installer"].map((role) => `<option value="${role}" ${role === target.role ? "selected" : ""}>${esc(ctx.roleLabel(role))}</option>`).join("")}</select></div>`;
    if (modal.type === "password")
      body =
        input("password", "New password", "", "password") +
        input("confirmation", "Confirm password", "", "password") +
        '<p class="small muted">Use 12 to 1024 characters. The backend also revokes the target account’s sessions.</p>';
    if (modal.type === "delete")
      body = `<p>Permanently delete <strong>${esc(target.full_name || target.email)}</strong>?</p><p class="small muted">This cannot be undone. The backend will refuse deletion when linked files or protected records prevent it. You can block the account instead.</p>`;
    return ctx.modalFrame(
      {
        edit: "Edit profile",
        role: "Change role",
        password: "Change password",
        delete: "Confirm account deletion",
      }[modal.type],
      target.email || "",
      `${notice()}<form id="account-form">${body}</form>`,
      "",
      "account-cancel",
      `<button type="button" class="btn ghost" data-action="account-cancel" ${disabled()}>Cancel</button><button type="button" class="btn ${modal.type === "delete" ? "danger" : ""}" data-action="account-save" ${disabled()}>${busy ? "Saving…" : modal.type === "delete" ? "Delete permanently" : "Save"}</button>`,
    );
  }

  async function handle(el) {
    const action = el.dataset.action;
    if (!action?.startsWith("account-")) return false;
    if (busy) return true;
    const type = action.slice(8);
    message = "";
    failed = false;
    if (type === "cancel") {
      modal = null;
      render();
      return true;
    }
    if (["edit", "role", "password", "delete"].includes(type)) {
      const permission = {
        edit: "update",
        role: "change_role",
        password: "change_password",
        delete: "delete",
      }[type];
      if (
        !can(permission) ||
        !find(el.dataset.id) ||
        (isProtectedAccount(find(el.dataset.id)) &&
          (!superAdmin() || ["role", "delete"].includes(type)))
      )
        return true;
      modal = { type, id: el.dataset.id };
      render();
      return true;
    }
    const form = ctx.$("#account-form");
    const values = form ? Object.fromEntries(new FormData(form)) : {};
    const target = find(modal?.id || el.dataset.id);
    const operation = modal?.type;
    // Clear credentials before any asynchronous work, including validation failures.
    if (operation === "password")
      form?.querySelectorAll('input[type="password"]').forEach((input) => {
        input.value = "";
      });
    busy = true;
    render();
    let completed = false;
    try {
      if (type === "save" && target) {
        if (operation === "edit") await backend.updateProfile(target, values);
        else if (operation === "role")
          await backend.changeRole(target, values.role);
        else if (operation === "password") {
          if (values.password !== values.confirmation)
            throw new Error("The passwords do not match");
          await backend.changePassword(target, values.password || "");
        } else if (operation === "delete") await backend.deleteAccount(target);
        else throw new Error("Choose an account action");
      } else if (type === "block" && target)
        await backend.setBlocked(target, target.status === "active");
      else if (type === "role-permission")
        await backend.setRolePermission(
          el.dataset.role,
          el.dataset.key,
          el.dataset.effect,
        );
      else if (type === "user-permission" && target)
        await backend.setUserPermission(
          target,
          el.dataset.key,
          el.dataset.effect,
        );
      else throw new Error("Account not found");
      completed = true;
      modal = null;
      message = "Change confirmed by the backend.";
    } catch (error) {
      failed = true;
      message = error.message;
      if (error.partial) modal = null;
    } finally {
      delete values.password;
      delete values.confirmation;
      busy = false;
      // Refresh even after failures: a request may have partially completed.
      await refresh();
      if (!lifecycle.disposed) {
        render();
        if (message) ctx.toast(message, completed ? "success" : "error");
      }
    }
    return true;
  }

  const stopWatch = backend.watch(() => void refresh());
  lifecycle.listen(window, "focus", () => void refresh());
  lifecycle.listen(window, "online", () => void refresh());
  lifecycle.listen(document, "visibilitychange", () => {
    if (!document.hidden) void refresh();
  });
  lifecycle.listen(ctx.root, "change", (event) => {
    if (event.target.matches("[data-account-user]")) {
      permissionUser = event.target.value;
      render();
    }
  });
  lifecycle.listen(ctx.root, "submit", (event) => {
    if (event.target.id === "account-form") {
      event.preventDefault();
      if (!busy) void handle({ dataset: { action: "account-save" } });
    }
  });
  lifecycle.setInterval(() => void refresh(), 30000);
  return {
    renderUsers,
    renderPermissions,
    renderModal,
    handle,
    refresh,
    dispose: stopWatch,
  };
}
