import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecordStore } from "../src/features/crm/cloud-records.js";

function fixture() {
  const calls = [];
  let fail = false;
  const client = {
    from(table) {
      const call = { table, filters: [] };
      const q = {
        insert(rows) {
          Object.assign(call, { operation: "insert", rows });
          return q;
        },
        update(values) {
          Object.assign(call, { operation: "update", values });
          return q;
        },
        delete() {
          call.operation = "delete";
          return q;
        },
        eq(k, v) {
          call.filters.push([k, v]);
          return q;
        },
        select() {
          return q;
        },
        single() {
          return q;
        },
        then(resolve, reject) {
          calls.push(call);
          const id = call.filters.find(([k]) => k === "id")?.[1];
          return Promise.resolve({
            data: fail
              ? null
              : call.operation === "insert"
                ? call.rows
                : call.operation === "delete"
                  ? [{ id }]
                  : { id },
            error: fail ? { message: "Access revoked" } : null,
          }).then(resolve, reject);
        },
      };
      return q;
    },
  };
  return {
    store: createRecordStore(client),
    calls,
    revoke: () => {
      fail = true;
    },
  };
}
test("an update-only grant updates the existing row without requiring an INSERT or writing normalized inventory/defaults", async () => {
  const { store, calls } = fixture();
  const state = {
    session: {},
    users: [],
    jobs: [{ id: "assigned", status: "Open" }],
    accessControl: { global: {} },
    products: [{ id: "variant", onHand: 12 }],
  };
  store.baseline(state);
  state.jobs[0].status = "Complete";
  state.products[0].onHand = 99;
  await store.sync(state);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].operation, "update");
  assert.deepEqual(calls[0].filters, [
    ["collection", "jobs"],
    ["id", "assigned"],
  ]);
  await store.sync(state);
  assert.equal(calls.length, 1);
});
test("new records and explicit deletions require returned confirmation, denied writes remain pending for an explicit retry", async () => {
  const { store, calls, revoke } = fixture();
  const state = { tasks: [{ id: "old" }] };
  store.baseline(state);
  state.tasks = [{ id: "new" }];
  await store.sync(state);
  assert.deepEqual(calls.map((c) => c.operation), ["insert"]);
  await store.remove("tasks", "old");
  assert.deepEqual(
    calls.map((c) => c.operation),
    ["insert", "delete"],
  );
  state.tasks[0].status = "Done";
  revoke();
  await assert.rejects(store.sync(state), /Access revoked/);
  await assert.rejects(store.sync(state), /Access revoked/);
  assert.deepEqual(
    calls.slice(-2).map((c) => c.operation),
    ["update", "update"],
  );
});

test("an accepted backend task snapshot does not turn a missing task into a delete", async () => {
  const { store, calls } = fixture();
  const state = {
    tasks: [
      { id: "assigned", status: "In Progress" },
      { id: "no-longer-in-review", status: "Pending" },
    ],
  };
  store.baseline(state);

  // The approval backend returns its current task projection, not a delete command.
  state.tasks = [{ id: "assigned", status: "In Progress" }];
  state.tasks[0].status = "Completed";
  await store.sync(state);

  assert.deepEqual(calls.map((call) => call.operation), ["update"]);
  assert.deepEqual(calls[0].filters, [
    ["collection", "tasks"],
    ["id", "assigned"],
  ]);
});

test("a new conversation is committed before its first message", async () => {
  const { store, calls } = fixture();
  const state = {
    messages: [{ id: "message-1", conversationId: "thread-1" }],
    conversations: [{ id: "thread-1", memberIds: ["admin", "manager"] }],
  };
  store.baseline({ messages: [], conversations: [] });
  await store.sync(state);
  assert.deepEqual(
    calls.map((call) => call.rows.map((row) => row.collection)),
    [["conversations"], ["messages"]],
  );
});

test("audit inserts confirm completion without SELECT permission on the actual Super Admin event", async () => {
  let calls = 0,
    fail = true;
  const store = createRecordStore({
    from: () => ({
      insert() {
        calls++;
        return {
          then(resolve, reject) {
            return Promise.resolve({
              data: null,
              error: fail ? { message: "Audit unavailable" } : null,
            }).then(resolve, reject);
          },
          select() {
            throw Error("Hidden audit rows must not be requested");
          },
        };
      },
    }),
  });
  const state = { logs: [] };
  store.baseline(state);
  state.logs.push({
    id: "impersonation-log",
    actorRole: "super_admin",
    actingAsUserId: "manager",
  });
  await assert.rejects(store.sync(state), /Audit unavailable/);
  fail = false;
  await store.sync(state);
  await store.sync(state);
  assert.equal(calls, 2);
});

test("background reads leave the local write baseline intact until accepted", async () => {
  const operations = [];
  const store = createRecordStore({
    from() {
      return {
        select() {
          return this;
        },
        order() {
          return this;
        },
        range() {
          return Promise.resolve({
            data: [{ collection: "leads", id: "lead-1", data: { id: "lead-1", name: "Remote" } }],
            error: null,
          });
        },
        update(values) {
          operations.push(values);
          return {
            eq() {
              return this;
            },
            select() {
              return this;
            },
            single() {
              return Promise.resolve({ data: { id: "lead-1" }, error: null });
            },
          };
        },
      };
    },
  });
  const local = { leads: [{ id: "lead-1", name: "Original" }] };
  store.baseline(local);
  const fresh = await store.load({ updateSnapshot: false });
  assert.equal(fresh.leads[0].name, "Remote");
  local.leads[0].name = "My unsaved edit";
  await store.sync(local);
  assert.deepEqual(operations, [{ data: { id: "lead-1", name: "My unsaved edit" } }]);
});

test("CRM change events request a refresh and unsubscribe cleanly", async () => {
  let callback;
  let removed = false;
  let changes = 0;
  const channel = {
    on(type, filter, handler) {
      assert.equal(type, "postgres_changes");
      assert.deepEqual(filter, {
        event: "*",
        schema: "public",
        table: "crm_records",
      });
      callback = handler;
      return this;
    },
    subscribe() {
      return this;
    },
  };
  const store = createRecordStore({
    channel: () => channel,
    removeChannel: async (value) => {
      assert.equal(value, channel);
      removed = true;
    },
  });
  const stop = store.watch(() => changes++);
  callback();
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(changes, 1);
  stop();
  assert.equal(removed, true);
});
