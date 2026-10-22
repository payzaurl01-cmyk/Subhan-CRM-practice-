import { test } from "node:test";
import assert from "node:assert/strict";
import { createMasterBackend } from "../src/features/crm/master-backend.js";
import { createScopedFetch } from "../src/features/crm/impersonation.js";
import { makeHandler } from "../supabase/functions/create-user/handler.mjs";

test("Master Control sends exact scoped rules and ordinary delegation to separate endpoints", async () => {
  const calls = [];
  const backend = createMasterBackend({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        data:
          name === "admin_get_master_control"
            ? { schema_version: 2, impersonation_supported: true }
            : name === "start_impersonation"
              ? "session-id"
              : true,
      };
    },
  });
  await backend.module("warehouse", "global", null, "readonly");
  await backend.permission("role", "manager", "users.change_password", "deny");
  await backend.permission("user", "staff", "users.change_password", "default");
  await backend.rule(
    "override",
    "user",
    "staff",
    "inventory",
    "update",
    "allow",
  );
  await backend.rule("tab", "role", "role-id", "billing", "view", "deny");
  await backend.lock(true, "Maintenance", "Details");
  await backend.start("staff", " Support ", "TICKET");
  await backend.end("session-id");
  assert.deepEqual(calls[0], {
    name: "admin_set_module_access",
    args: {
      p_module_key: "warehouse",
      p_scope: "global",
      p_target_id: null,
      p_state: "readonly",
    },
  });
  assert.deepEqual(calls[1], {
    name: "admin_set_role_permission",
    args: {
      p_role_key: "manager",
      p_permission_key: "users.change_password",
      p_effect: "deny",
    },
  });
  assert.deepEqual(calls[3], {
    name: "admin_set_access_rule",
    args: {
      p_kind: "override",
      p_scope: "user",
      p_target_id: "staff",
      p_module_key: "inventory",
      p_action: "update",
      p_effect: "allow",
    },
  });
  assert.deepEqual(calls.at(-2), {
    name: "start_impersonation",
    args: {
      p_target_user_id: "staff",
      p_reason: "Support",
      p_ticket_reference: "TICKET",
    },
  });
});
test("audit-only impersonation cannot start before the enforcement extension exists", async () => {
  const calls = [];
  const backend = createMasterBackend({
    rpc: async (name) => {
      calls.push(name);
      return { data: { schema_version: 1 } };
    },
  });
  await assert.rejects(backend.start("staff", "Support"), /backend extension/);
  assert.deepEqual(calls, ["admin_get_master_control"]);
});
test("every scoped REST request selects the audited session, exit uses original identity, other services fail closed", async () => {
  const calls = [];
  const fetcher = createScopedFetch(
    async (input, init) => {
      calls.push({ input, init });
      return new Response("{}");
    },
    () => "selected-session",
  );
  await fetcher("https://project.supabase.co/rest/v1/rpc/get_access_context", {
    headers: { Authorization: "Bearer user-token" },
  });
  assert.equal(
    calls[0].init.headers.get("x-crm-impersonation"),
    "selected-session",
  );
  assert.equal(calls[0].init.headers.get("authorization"), "Bearer user-token");
  await fetcher("https://project.supabase.co/rest/v1/rpc/end_impersonation", {
    headers: { "x-crm-impersonation": "stale" },
  });
  assert.equal(calls[1].init.headers.has("x-crm-impersonation"), false);
  for (const path of [
    "/storage/v1/object/sign/private/file",
    "/functions/v1/create-user",
  ])
    assert.equal(
      (await fetcher(`https://project.supabase.co${path}`)).status,
      403,
    );
  assert.equal(
    (
      await fetcher(
        new Request("https://project.supabase.co/auth/v1/user", {
          method: "PUT",
        }),
      )
    ).status,
    403,
  );
  assert.equal(calls.length, 2);
});
function inviteFixture({
  allowed = true,
  role = "manager",
  auditError = false,
} = {}) {
  const calls = [];
  const handler = makeHandler({
    env: (n) =>
      ({
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_ANON_KEY: "public",
        SUPABASE_SERVICE_ROLE_KEY: "secret-server-test-key",
      })[n],
    createClient: (url, key) =>
      key === "public"
        ? {
            auth: {
              getUser: async () => ({ data: { user: { id: "actor" } } }),
            },
            rpc: async () => ({
              data: {
                profile: { role },
                modules: [{ key: "users", can_create: allowed }],
              },
            }),
          }
        : {
            auth: {
              admin: {
                inviteUserByEmail: async (email) => {
                  calls.push({ email });
                  return { data: { user: { id: "new-id" } } };
                },
                deleteUser: async () => ({}),
              },
            },
            from: (table) => ({
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    single: async () => ({ data: { id: "role-id" } }),
                  }),
                }),
              }),
              update: () => ({
                eq: () => ({
                  select: () => ({
                    single: async () => ({ data: { id: "new-id" } }),
                  }),
                }),
              }),
              insert: async () => ({
                error: auditError ? { message: "Audit unavailable" } : null,
              }),
            }),
          },
  });
  const request = () =>
    handler(
      new Request("https://project.supabase.co/functions/v1/create-user", {
        method: "POST",
        headers: {
          Authorization: "Bearer fixture",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "disposable@example.invalid",
          full_name: "Disposable staff",
          role_key: "installer",
        }),
      }),
    );
  return { calls, request };
}
test("existing invitation flow honors a current Manager grant and denies revoked grants without inviting", async () => {
  const allowed = inviteFixture();
  assert.equal((await allowed.request()).status, 201);
  assert.equal(allowed.calls.length, 1);
  const denied = inviteFixture({ allowed: false });
  assert.equal((await denied.request()).status, 403);
  assert.equal(denied.calls.length, 0);
  const partial = inviteFixture({ auditError: true });
  const response = await partial.request();
  assert.equal(response.status, 502);
  assert.equal((await response.json()).account_created, true);
  assert.equal(partial.calls.length, 1);
});

test("cancelled authenticator setup removes only the unverified factor and preserves a verified factor", async () => {
  const calls = [];
  const backend = createMasterBackend({
    auth: {
      mfa: {
        listFactors: async () => ({
          data: {
            all: [
              { id: "draft", status: "unverified" },
              { id: "live", status: "verified" },
            ],
          },
        }),
        unenroll: async (args) => {
          calls.push(args);
          return { data: { id: args.factorId } };
        },
      },
    },
  });
  await backend.cancelMFA("draft");
  await backend.cancelMFA("live");
  assert.deepEqual(calls, [{ factorId: "draft" }]);
});
