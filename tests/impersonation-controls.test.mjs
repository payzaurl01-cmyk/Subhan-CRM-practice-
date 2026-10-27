import { test } from "node:test";
import assert from "node:assert/strict";
import { createMasterControls } from "../src/features/crm/master-controls.js";
import { visibleActorLog } from "../src/features/crm/log-visibility.js";
const id = "44444444-4444-4444-8444-444444444444";
test("one click starts immediately without a form, rejects duplicate clicks, and remembers the profile-list return path", async () => {
  const oldDocument = globalThis.document,
    oldLocation = globalThis.location;
  const cookies = new Map();
  globalThis.document = {
    get cookie() {
      return [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    set cookie(v) {
      const [key, value] = v.split(";")[0].split("=");
      cookies.set(key, value);
    },
  };
  globalThis.location = { protocol: "https:" };
  try {
    const calls = [],
      paths = [],
      errors = [];
    let finish,
      prepared = 0;
    const controls = createMasterControls({
      backend: {
        start(target) {
          calls.push(target);
          return new Promise((resolve) => {
            finish = resolve;
          });
        },
      },
      ctx: {
        root: {},
        esc: String,
        ui: { page: "users" },
        prepareIdentityChange: async () => {
          prepared++;
        },
        toast: (...args) => errors.push(args),
      },
      access: () => ({
        profile: { role: "super_admin" },
        modules: [{ key: "master_control", can_view: true }],
      }),
      accounts: () => [{ id: "staff", role: "manager", status: "active" }],
      lifecycle: { disposed: false, listen() {} },
      render() {},
      revalidate: async () => {},
      navigate: (p) => paths.push(p),
    });
    const first = controls.handle({
      dataset: { action: "master-impersonate", id: "staff" },
    });
    assert.equal(controls.isBusy(), true);
    assert.equal(controls.startingUser(), "staff");
    assert.equal(controls.renderModal(), "");
    await controls.handle({
      dataset: { action: "master-impersonate", id: "staff" },
    });
    assert.deepEqual(calls, ["staff"]);
    finish(id);
    await first;
    assert.equal(prepared, 1);
    assert.deepEqual(paths, ["/crm/dashboard"]);
    assert.equal(cookies.get("crm-impersonation"), id);
    assert.equal(
      cookies.get("crm-impersonation-return"),
      encodeURIComponent("/crm/users"),
    );
    assert.deepEqual(errors, []);
  } finally {
    globalThis.document = oldDocument;
    globalThis.location = oldLocation;
  }
});
test("failed starts preserve the original identity and show the backend error", async () => {
  const errors = [],
    paths = [];
  const controls = createMasterControls({
    backend: {
      async start() {
        throw Error("Target account is blocked");
      },
    },
    ctx: {
      root: {},
      esc: String,
      ui: { page: "users" },
      toast: (...args) => errors.push(args),
    },
    access: () => ({
      profile: { role: "super_admin" },
      modules: [{ key: "master_control", can_view: true }],
    }),
    accounts: () => [{ id: "staff", role: "manager", status: "active" }],
    lifecycle: { disposed: false, listen() {} },
    render() {},
    revalidate: async () => {},
    navigate: (p) => paths.push(p),
  });
  await controls.handle({
    dataset: { action: "master-impersonate", id: "staff" },
  });
  assert.deepEqual(paths, []);
  assert.deepEqual(errors, [["Target account is blocked", "error"]]);
  assert.equal(controls.isBusy(), false);
  assert.equal(controls.renderModal(), "");
});
test("frontend role maximum uses the event snapshot, includes peers, and fails closed for historical unknown roles", () => {
  const roles = ["super_admin", "admin", "manager", "installer", undefined];
  assert.deepEqual(
    roles.map((r) => visibleActorLog("super_admin", r)),
    [true, true, true, true, true],
  );
  assert.deepEqual(
    roles.map((r) => visibleActorLog("admin", r)),
    [false, true, true, true, false],
  );
  assert.deepEqual(
    roles.map((r) => visibleActorLog("manager", r)),
    [false, false, true, true, false],
  );
  assert.equal(visibleActorLog("manager", "super_admin"), false);
  assert.equal(visibleActorLog(undefined, "installer"), false);
});
