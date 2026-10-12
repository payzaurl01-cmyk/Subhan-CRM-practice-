import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveEntry,
  modulePath,
  moduleFromPath,
} from "../src/features/crm/routes.js";
import { createLifecycle } from "../src/features/crm/lifecycle.js";
test("direct URLs reject unknown and staff owner-only entry", () => {
  assert.equal(resolveEntry(["crm", "master"]), null);
  assert.equal(resolveEntry(["crm", "invented"]), null);
  assert.equal(resolveEntry(["owner", "jobs", "extra"]), null);
  assert.deepEqual(resolveEntry(["crm", "returns"]), { page: "returns" });
  assert.deepEqual(resolveEntry(["owner"]), { page: "master" });
  assert.equal(modulePath("purchasing"), "/crm/purchasing");
  assert.equal(modulePath("jobs", true), "/owner/jobs");
  assert.equal(moduleFromPath("/owner"), "master");
});
test("disposing a workspace removes events, pending callbacks and object URLs", async () => {
  const lifecycle = createLifecycle(),
    target = new EventTarget();
  let calls = 0;
  lifecycle.listen(target, "action", () => calls++);
  target.dispatchEvent(new Event("action"));
  assert.equal(calls, 1);
  lifecycle.setTimeout(() => calls++, 20);
  lifecycle.setInterval(() => calls++, 20);
  const url = lifecycle.createObjectURL(new Blob(["media"]));
  assert.equal(await (await fetch(url)).text(), "media");
  lifecycle.dispose();
  lifecycle.dispose();
  target.dispatchEvent(new Event("action"));
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(calls, 1);
  assert.equal(lifecycle.disposed, true);
  assert.throws(() => lifecycle.createObjectURL(new Blob(["late media"])), {
    name: "AbortError",
  });
  await assert.rejects(fetch(url));
});
