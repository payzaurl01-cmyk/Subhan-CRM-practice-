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
  };
  window.accountFixture = fixture;
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "get_access_context") {
        fixture.refreshCount++;
        return fixture.accessError
          ? { error: { message: fixture.accessError } }
          : { data: structuredClone(context) };
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
      if (name === "admin_set_role_permission")
        rules.roles.find(
          (rule) =>
            rule.roles.key === args.p_role_key &&
            rule.permissions.key === args.p_permission_key,
        ).effect = args.p_effect;
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
  history.replaceState(null, "", "/crm/users");
  fixture.dispose = mountCRM(document.getElementById("fixture-root"), "users", {
    viewer: {
      id: actorId,
      email: accounts[0].email,
      name: "Signed In User",
      role,
      roleName: role,
      initials: "SU",
    },
    ownerVerified: role === "super_admin",
    auth: { enabled: true, accounts: backend, signOut: async () => {} },
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
