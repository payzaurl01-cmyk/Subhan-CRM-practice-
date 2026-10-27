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
test("new records and deletions require returned confirmation, denied writes remain pending for an explicit retry", async () => {
  const { store, calls, revoke } = fixture();
  const state = { tasks: [{ id: "old" }] };
  store.baseline(state);
  state.tasks = [{ id: "new" }];
  await store.sync(state);
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
