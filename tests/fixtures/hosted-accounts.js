import { createMasterBackend } from "/__account-fixture/master-backend.js";
import { impersonationId } from "/__account-fixture/impersonation.js";
import { mountCRM } from "/__account-fixture/runtime.js";
import {
  createAccountsBackend,
  ACCOUNT_PERMISSIONS,
} from "/__account-fixture/accounts-backend.js";

// Browser-only fixture: every service call stays in memory.
export async function mount(role) {
  const actorId = "00000000-0000-4000-8000-000000000001";
  const targetId = "00000000-0000-4000-8000-000000000002";
  const ownerId =
    role === "super_admin" ? actorId : "00000000-0000-4000-8000-000000000003";
  const accounts = [
    {
      id: actorId,
      email:
        role === "super_admin"
          ? "annasabbas01@gmail.com"
          : `${role}@example.com`,
      full_name: "Signed In User",
      phone: "123",
      role,
      status: "active",
    },
    {
      id: targetId,
      email: "target@example.com",
      full_name: "Target Staff",
      phone: "456",
      role: "installer",
      status: "active",
    },
    ...(ownerId !== actorId
      ? [
          {
            id: ownerId,
            email: "annasabbas01@gmail.com",
            full_name: "Protected Owner",
            phone: "",
            role: "super_admin",
            status: "active",
          },
        ]
      : []),
  ];
  const modules = [
    { key: "dashboard", can_view: true },
    {
      key: "users",
      can_view: true,
      ...Object.fromEntries(
        Object.keys(ACCOUNT_PERMISSIONS).map((key) => [`can_${key}`, true]),
      ),
    },
    { key: "master_control", can_view: role === "super_admin" },
  ];
  const context = { profile: { ...accounts[0] }, modules };
  const rules = {
    roles: ["admin", "manager"].flatMap((key) =>
      Object.keys(ACCOUNT_PERMISSIONS).map((permission) => ({
        roles: { key },
        permissions: { key: `users.${permission}` },
        effect: "allow",
      })),
    ),
    users: [],
  };
  const registry = (
    await (await fetch("/__account-fixture/registry.json")).json()
  ).registry;
  const master = {
    schema_version: 2,
    impersonation_supported: true,
    modules: registry.modules,
    permissions: registry.permissions,
    roles: registry.roles,
    role_permissions: [],
    user_permissions: [],
    module_rules: [],
    rules: [],
    system_locks: [],
    effective: [],
  };
  const nativeProfile = { ...context.profile };
  const nativeModules = structuredClone(modules);
  if (role === "super_admin") {
    context.modules = registry.modules.map((m) => ({
      key: m.key,
      can_view: true,
      can_create: true,
      can_update: true,
      can_delete: true,
      can_approve: true,
      can_export: true,
      can_change_role: true,
      can_change_password: true,
      can_block: true,
      tab_visible: true,
    }));
  } else context.modules.find((m) => m.key === "users").can_create = true;
  const ownerModules = structuredClone(context.modules);
  if (impersonationId()) {
    context.profile = { ...accounts[1] };
    context.impersonation = {
      id: impersonationId(),
      real_actor_user_id: actorId,
      effective_actor_user_id: targetId,
    };
    context.modules = registry.modules.map((m) => ({
      key: m.key,
      can_view: ["dashboard", "jobs", "tasks", "warehouse", "chat"].includes(
        m.key,
      ),
      can_update: ["jobs", "tasks", "warehouse"].includes(m.key),
      tab_visible: true,
    }));
  }
  const calls = [];
  const fixture = {
    calls,
    context,
    accounts,
    rules,
    targetId,
    ownerId,
    deletedError: "",
    partialPassword: false,
    accessError: "",
    refreshCount: 0,
    master,
    masterError: "",
    nativeProfile,
    ownerModules,
  };
  window.accountFixture = fixture;
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "get_access_context") {
        context.impersonation_supported = true;
        fixture.refreshCount++;
        return fixture.accessError
          ? { error: { message: fixture.accessError } }
          : { data: structuredClone(context) };
      }
      if (name === "admin_get_master_control") {
        if (fixture.masterError)
          return { error: { message: fixture.masterError } };
        master.role_permissions = rules.roles.map((row) => ({
          role_id: registry.roles.find((r) => r.key === row.roles.key).id,
          permission_id: registry.permissions.find(
            (p) => p.key === row.permissions.key,
          ).id,
          effect: row.effect,
        }));
        master.user_permissions = rules.users.map((row) => ({
          user_id: row.user_id,
          permission_id: registry.permissions.find(
            (p) => p.key === row.permissions.key,
          ).id,
          effect: row.effect,
        }));
        master.effective = registry.modules.map((m) => ({
          key: m.key,
          state: "enabled",
          can_view: true,
          tab_visible: true,
          decisions: Object.fromEntries(
            registry.permissions
              .filter((p) => p.module_id === m.id)
              .map((p) => [
                p.action,
                { allowed: true, source: "ordinary_role_allow" },
              ]),
          ),
        }));
        return { data: structuredClone(master) };
      }
      if (name === "start_impersonation")
        return { data: "44444444-4444-4444-8444-444444444444" };
      if (name === "end_impersonation") {
        context.profile = nativeProfile;
        context.modules = ownerModules;
        delete context.impersonation;
        return { data: true };
      }
      if (name === "admin_set_module_access") {
        const m = registry.modules.find((m) => m.key === args.p_module_key);
        master.module_rules = master.module_rules.filter(
          (r) => !(r.module_id === m.id && r.scope_type === args.p_scope),
        );
        if (args.p_state !== "default")
          master.module_rules.push({
            module_id: m.id,
            scope_type: args.p_scope,
            role_id: args.p_scope === "role" ? args.p_target_id : null,
            user_id: args.p_scope === "user" ? args.p_target_id : null,
            access_state: args.p_state,
          });
        return { data: true };
      }
      if (name === "admin_set_access_rule") {
        const m = registry.modules.find((m) => m.key === args.p_module_key);
        master.rules = master.rules.filter(
          (r) =>
            !(
              r.module_id === m.id &&
              r.rule_kind === args.p_kind &&
              r.scope_type === args.p_scope &&
              r.action === args.p_action
            ),
        );
        if (args.p_effect !== "default")
          master.rules.push({
            id: "rule",
            rule_kind: args.p_kind,
            module_id: m.id,
            scope_type: args.p_scope,
            role_id: args.p_scope === "role" ? args.p_target_id : null,
            user_id: args.p_scope === "user" ? args.p_target_id : null,
            action: args.p_action,
            effect: args.p_effect,
          });
        return { data: true };
      }
      if (name === "admin_set_system_lock") {
        master.system_locks = [{ scope: "global", is_locked: args.p_locked }];
        return { data: true };
      }
      const target = accounts.find((account) => account.id === args.p_user_id);
      if (name === "admin_set_user_blocked")
        target.status = args.p_blocked ? "blocked" : "active";
      if (name === "admin_update_user_access") target.role = args.p_role_key;
      if (name === "admin_delete_user") {
        if (fixture.deletedError)
          return { error: { message: fixture.deletedError } };
        accounts.splice(accounts.indexOf(target), 1);
      }
      if (name === "admin_set_role_permission") {
        let row = rules.roles.find(
          (rule) =>
            rule.roles.key === args.p_role_key &&
            rule.permissions.key === args.p_permission_key,
        );
        if (!row) {
          row = {
            roles: { key: args.p_role_key },
            permissions: { key: args.p_permission_key },
          };
          rules.roles.push(row);
        }
        row.effect = args.p_effect;
      }
      if (name === "admin_set_user_permission") {
        rules.users = rules.users.filter(
          (rule) =>
            rule.user_id !== args.p_user_id ||
            rule.permissions.key !== args.p_permission_key,
        );
        if (args.p_effect !== "default")
          rules.users.push({
            user_id: args.p_user_id,
            permissions: { key: args.p_permission_key },
            effect: args.p_effect,
          });
      }
      return { data: true };
    },
    from(table) {
      return {
        select() {
          if (table === "role_permissions")
            return Promise.resolve({ data: structuredClone(rules.roles) });
          if (table === "user_permissions")
            return Promise.resolve({ data: structuredClone(rules.users) });
          return {
            order: async () => ({
              data: structuredClone(
                accounts.map((account) => ({
                  ...account,
                  roles: { key: account.role },
                })),
              ),
            }),
          };
        },
        update(details) {
          return {
            eq(key, id) {
              calls.push({ name: "profiles.update", args: { id, ...details } });
              Object.assign(
                accounts.find((account) => account.id === id),
                details,
              );
              return {
                select: () => ({ single: async () => ({ data: { id } }) }),
              };
            },
          };
        },
      };
    },
    functions: {
      async invoke(name, args) {
        if (name === "create-user") {
          calls.push({ name, args });
          accounts.push({
            id: "new-account",
            email: args.body.email,
            full_name: args.body.full_name,
            role: args.body.role_key,
            status: "active",
          });
          return { data: { user_id: "new-account", invitation_sent: true } };
        }
        calls.push({
          name,
          args: {
            ...args,
            body: { user_id: args.body.user_id, password: "[redacted]" },
          },
        });
        if (fixture.partialPassword)
          return {
            error: {
              message: "non-2xx",
              context: new Response(
                JSON.stringify({
                  error: "session_cleanup_or_audit_failed",
                  password_changed: true,
                }),
                { status: 502 },
              ),
            },
          };
        return { data: { success: true, password_changed: true } };
      },
    },
    auth: {
      updateUser: async () => {
        calls.push({
          name: "auth.updateUser",
          args: { password: "[redacted]" },
        });
        return { data: { user: { id: context.profile.id } } };
      },
      mfa: {
        listFactors: async () => ({
          data: { totp: [{ id: "factor", status: "verified" }] },
        }),
        challengeAndVerify: async () => ({ data: { access_token: "fixture" } }),
      },
      getSession: async () => ({
        data: { session: { access_token: "mock-user-session" } },
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
    },
    channel() {
      const channel = {
        on() {
          return channel;
        },
        subscribe() {},
      };
      return channel;
    },
    removeChannel() {},
  };
  const backend = createAccountsBackend(client);
  const initial = {
    context: structuredClone(context),
    accounts: await backend.list(context),
    rules: await backend.permissionRules(context),
  };
  const staff = () =>
    accounts.map((account) => ({
      ...account,
      role_key: account.role,
      role_name: account.role,
    }));
  document.body.innerHTML =
    '<div id="fixture-root"><div id="app"></div><div id="overlay" class="modal-layer"></div><div id="toasts" class="toast-wrap" aria-live="polite"></div></div>';
  const entry = location.pathname.startsWith("/crm/")
    ? location.pathname.slice(5)
    : "users";
  history.replaceState(null, "", `/crm/${entry}`);
  fixture.dispose = mountCRM(document.getElementById("fixture-root"), entry, {
    viewer: {
      id: actorId,
      email: accounts[0].email,
      name: "Signed In User",
      role,
      roleName: role,
      initials: "SU",
    },
    ownerVerified: role === "super_admin",
    auth: {
      enabled: true,
      accounts: backend,
      master: createMasterBackend(client),
      signOut: async () => {},
    },
    accounts: initial,
    cloud: {
      data: {},
      staff: staff(),
      store: {
        sync: async () => {},
        load: async () => ({}),
        staff: async () => staff(),
      },
    },
  });
}
