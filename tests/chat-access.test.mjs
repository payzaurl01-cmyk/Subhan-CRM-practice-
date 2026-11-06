import { test } from "node:test";
import assert from "node:assert/strict";
import { availableChatUsers, canUseChat } from "../src/features/crm/chat-access.js";

const users = [
  { id: "owner", role: "super_admin", status: "Active" },
  { id: "admin", role: "admin", status: "Active" },
  { id: "manager", role: "manager", status: "Active" },
  { id: "installer", role: "installer", status: "Active" },
  { id: "former", role: "manager", status: "Inactive" },
];
const ids = (viewer) => availableChatUsers(viewer, users).map((user) => user.id);

test("direct Super Admin sessions have no chat while impersonation uses the target role", () => {
  assert.equal(canUseChat(users[0]), false);
  assert.deepEqual(ids(users[0]), []);
  assert.deepEqual(ids(users[1]), ["manager", "installer"]);
  assert.deepEqual(ids(users[2]), ["admin", "installer"]);
  assert.deepEqual(ids(users[3]), ["admin", "manager"]);
  assert.deepEqual(ids({ ...users[2], id: "owner" }), ["admin", "manager", "installer"]);
});
