import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAccountsBackend,
  ACCOUNT_PERMISSIONS,
} from "../src/features/crm/accounts-backend.js";

const target = {
  id: "target-id",
  role: "installer",
  status: "blocked",
  email: "staff@example.com",
};
function fixture(role = "manager") {
  const calls = [];
  const module = {
    key: "users",
    can_view: true,
    ...Object.fromEntries(
      Object.keys(ACCOUNT_PERMISSIONS).map((key) => [`can_${key}`, true]),
    ),
  };
  const access = {
    profile: { id: "actor-id", role, status: "active" },
    modules: [module],
  };
  let rpcResult = true;
  let rpcError = null;
  let functionResult = { data: { success: true, password_changed: true } };
  let profileResult = { data: { id: target.id }, error: null };
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      return name === "get_access_context"
        ? { data: structuredClone(access) }
        : { data: rpcResult, error: rpcError };
    },
    from(table) {
      calls.push({ table });
      return {
        update(fields) {
          calls.push({ fields });
          return {
            eq(key, value) {
              calls.push({ key, value });
              return {
                select() {
                  return { single: async () => profileResult };
                },
              };
            },
          };
        },
      };
    },
    auth: {
      updateUser: async () => {
        calls.push({
          name: "auth.updateUser",
          args: { password: "[redacted]" },
        });
        return { data: { user: { id: access.profile.id } } };
      },
      getSession: async () => ({
        data: { session: { access_token: "signed-in-user-token" } },
      }),
    },
    functions: {
      async invoke(name, args) {
        calls.push({ name, args });
        return functionResult;
      },
    },
  };
  return {
    backend: createAccountsBackend(client),
    calls,
    access,
    module,
    rpcResult(value) {
      rpcResult = value;
    },
    rpcError(value) {
      rpcError = value;
    },
    functionResult(value) {
      functionResult = value;
    },
    profileResult(value) {
      profileResult = value;
    },
  };
}

for (const role of ["admin", "manager", "super_admin"]) {
  test(`${role} uses exact deployed role, block and delete RPC contracts`, async () => {
    const f = fixture(role);
    await f.backend.changeRole(target, "admin");
    await f.backend.setBlocked(target, false);
    await f.backend.deleteAccount(target);
    assert.deepEqual(
      f.calls.filter((call) => call.name && call.name !== "get_access_context"),
      [
        {
          name: "admin_update_user_access",
          args: {
            p_user_id: target.id,
            p_role_key: "admin",
            p_status: "blocked",
          },
        },
        {
          name: "admin_set_user_blocked",
          args: { p_user_id: target.id, p_blocked: false },
        },
        { name: "admin_delete_user", args: { p_user_id: target.id } },
      ],
    );
    assert.equal(
      f.calls.filter((call) => call.name === "get_access_context").length,
      3,
    );
    assert.ok(
      f.calls
        .filter((call) => call.name === "get_access_context")
        .every((call) => call.args.p_platform === "web"),
    );
  });
}

test("each revoked permission prevents a stale action from reaching the mutation endpoint", async () => {
  const actions = {
    update: (b) => b.updateProfile(target, { full_name: "Updated" }),
    change_role: (b) => b.changeRole(target, "manager"),
    change_password: (b) => b.changePassword(target, "example-password-123"),
    block: (b) => b.setBlocked(target, true),
    delete: (b) => b.deleteAccount(target),
  };
  for (const [permission, action] of Object.entries(actions)) {
    const f = fixture();
    f.module[`can_${permission}`] = false;
    await assert.rejects(action(f.backend), new RegExp(`users.${permission}`));
    assert.equal(f.calls.length, 1);
  }
});

test("protected owner and active account cannot be blocked, deleted or reassigned", async () => {
  const f = fixture("super_admin");
  for (const account of [
    { ...target, role: "super_admin" },
    { ...target, email: "AnnasAbbas01@gmail.com" },
    { ...target, id: "actor-id" },
  ]) {
    await assert.rejects(f.backend.setBlocked(account, true));
    await assert.rejects(f.backend.deleteAccount(account));
    await assert.rejects(f.backend.changeRole(account, "manager"));
  }
  assert.equal(
    f.calls.filter((call) => call.name !== "get_access_context").length,
    0,
  );
});

test("profile writes whitelist editable fields and require an updated row", async () => {
  const f = fixture();
  await f.backend.updateProfile(target, {
    full_name: " Staff Name ",
    phone: " 123 ",
    role_id: "ignored",
    email: "ignored@example.com",
  });
  assert.deepEqual(f.calls.find((call) => call.fields).fields, {
    full_name: "Staff Name",
    phone: "123",
  });
  f.profileResult({
    data: null,
    error: { message: "row-level security denied" },
  });
  await assert.rejects(
    f.backend.updateProfile(target, { full_name: "Staff" }),
    /row-level security denied/,
  );
});

test("RPC errors and non-confirmations never report success or retry", async () => {
  const f = fixture();
  f.rpcError({ message: "User has linked records or protected history" });
  await assert.rejects(f.backend.deleteAccount(target), /linked records/);
  assert.equal(
    f.calls.filter((call) => call.name === "admin_delete_user").length,
    1,
  );
  f.rpcError(null);
  f.rpcResult(false);
  await assert.rejects(f.backend.setBlocked(target, true), /did not confirm/);
});

test("password function receives the signed-in session and enforces backend length", async () => {
  const f = fixture();
  await f.backend.changePassword(target, "example-password-123");
  assert.deepEqual(
    f.calls.find((call) => call.name === "owner-change-password"),
    {
      name: "owner-change-password",
      args: {
        headers: { Authorization: "Bearer signed-in-user-token" },
        body: { user_id: target.id, password: "example-password-123" },
      },
    },
  );
  await assert.rejects(f.backend.changePassword(target, "short"), /12 to 1024/);
  assert.equal(
    f.calls.filter((call) => call.name === "owner-change-password").length,
    1,
  );
});

test("partial password errors preserve backend details and are never retried", async () => {
  const f = fixture();
  f.functionResult({
    data: null,
    error: {
      message: "Non-2xx",
      context: new Response(
        JSON.stringify({
          error: "session_cleanup_or_audit_failed",
          password_changed: true,
        }),
        { status: 502 },
      ),
    },
  });
  await assert.rejects(
    f.backend.changePassword(target, "example-password-123"),
    (error) => {
      assert.equal(error.partial, true);
      assert.match(error.message, /session_cleanup_or_audit_failed/);
      assert.match(error.message, /Password changed/);
      return true;
    },
  );
  assert.equal(
    f.calls.filter((call) => call.name === "owner-change-password").length,
    1,
  );
});

test("only Super Admin can set role permissions and all override effects are forwarded", async () => {
  const staff = fixture();
  await assert.rejects(
    staff.backend.setRolePermission("admin", "delete", "deny"),
    /Super Admin required/,
  );
  await assert.rejects(
    staff.backend.setUserPermission(target, "delete", "allow"),
    /Super Admin required/,
  );
  const f = fixture("super_admin");
  for (const key of Object.keys(ACCOUNT_PERMISSIONS)) {
    for (const effect of ["deny", "allow"])
      await f.backend.setRolePermission("manager", key, effect);
    for (const effect of ["allow", "deny", "default"])
      await f.backend.setUserPermission(target, key, effect);
  }
  assert.equal(
    f.calls.filter((call) => call.name === "admin_set_role_permission").length,
    10,
  );
  assert.equal(
    f.calls.filter((call) => call.name === "admin_set_user_permission").length,
    15,
  );
  assert.deepEqual(f.calls.at(-1), {
    name: "admin_set_user_permission",
    args: {
      p_user_id: target.id,
      p_permission_key: "users.delete",
      p_effect: "default",
    },
  });
});

test("inactive profiles, revoked sessions and system locks fail closed", async () => {
  const f = fixture();
  f.access.profile.status = "blocked";
  await assert.rejects(f.backend.context(), /Active profile/);
  f.access.profile.status = "active";
  f.access.modules = [{ key: "users", can_view: false }];
  await assert.rejects(f.backend.context(), /no workspace access/);
  f.access.system_lock = { locked: true, message: "Scheduled maintenance" };
  await assert.rejects(f.backend.context(), /Scheduled maintenance/);
});

test("self-service changes use auth.updateUser even without delegated password authority", async () => {
  const f = fixture("super_admin");
  f.module.can_change_password = false;
  await f.backend.changePassword(
    {
      ...target,
      id: "actor-id",
      role: "super_admin",
      email: "annasabbas01@gmail.com",
    },
    "self-password-for-testing",
  );
  assert.equal(f.calls.filter((c) => c.name === "auth.updateUser").length, 1);
  assert.equal(
    f.calls.filter((c) => c.name === "owner-change-password").length,
    0,
  );
});
