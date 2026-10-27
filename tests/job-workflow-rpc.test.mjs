import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
let db;
const admin = "10000000-0000-4000-8000-000000000001",
  installer = "10000000-0000-4000-8000-000000000002",
  variant = "30000000-0000-4000-8000-000000000001";
const migration = new URL(
  "../supabase/migrations/20261027075508_restore_crm_job_workflow_rpc.sql",
  import.meta.url,
);
const op = () => crypto.randomUUID();
async function actor(id = admin) {
  await db.exec("reset role");
  await db.query("select set_config('test.actor',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function command(id, rev, operation, payload = {}, key = op()) {
  return (
    await db.query(
      "select public.crm_job_workflow_command($1,$2,$3,$4,$5) result",
      [
        id,
        rev,
        operation,
        JSON.stringify({ reason: "Isolated RPC test", ...payload }),
        key,
      ],
    )
  ).rows[0].result;
}
async function record(collection, id, data) {
  await db.query(
    "insert into crm_records(collection,id,data) values($1,$2,$3)",
    [collection, id, JSON.stringify({ id, ...data })],
  );
}
before(async () => {
  db = new PGlite();
  await db.exec(
    await readFile(
      new URL("./fixtures/job-workflow-baseline.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(`create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
 alter table roles add column active boolean default true;
 alter table products add column active boolean default true;
 alter table product_variants add column product_id uuid;
 insert into products(id,track_inventory) values('30000000-0000-4000-8000-000000000002',true);
 update product_variants set product_id='30000000-0000-4000-8000-000000000002';
 alter table crm_records enable row level security;
 create policy records_staff on crm_records to authenticated using(private.current_role_key() in ('admin','installer')) with check(private.current_role_key() in ('admin','installer'));`);
  await db.exec(await readFile(migration, "utf8"));
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261027075711_harden_crm_job_workflow_receipts.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await actor();
  await record("leads", "lead-text", {
    customer: "Test customer",
    service: "Repair",
    assignedTo: admin,
    stage: "Quotation",
    preserved: true,
  });
  const service = {
    id: "labour",
    kind: "Custom",
    quantity: 1,
    unitPrice: 100,
    lineTotal: 100,
    taxable: true,
  };
  await record("quotes", "quote-text", {
    leadId: "lead-text",
    status: "Accepted",
    number: "QUOTE-1",
    total: 110,
    gst: 10,
    items: [service],
    preserved: true,
  });
  await record("quotes", "stock-quote", {
    leadId: "lead-text",
    status: "Accepted",
    number: "QUOTE-2",
    total: 220,
    gst: 20,
    items: [
      {
        ...service,
        kind: "Inventory",
        productId: variant,
        quantity: 2,
        lineTotal: 200,
      },
    ],
  });
});
after(async () => db?.close());
test("RPC creates accepted quotation job using text ids, billing snapshot, linked tasks and no stock stages; exact replay writes once", async () => {
  await actor();
  const key = op();
  const args = { quoteId: "quote-text", installerId: installer };
  const a = await command("job-text", 0, "from_quote", args, key),
    b = await command("job-text", 0, "from_quote", args, key);
  assert.deepEqual(a, b);
  const log = (
    await db.query(
      "select data from crm_records where collection='logs' and id=$1",
      [`workflow-log-${key}`],
    )
  ).rows[0].data;
  assert.equal(log.reference, a.job.number);
  assert.equal(log.summary, "Isolated RPC test");
  assert.equal(log.result, "Success");
  assert.equal(a.job.quoteId, "quote-text");
  assert.equal(a.job.leadId, "lead-text");
  assert.deepEqual(
    a.job.stages.map((s) => s.type),
    ["Confirmed", "Repair Scheduled", "Repair in Progress", "Completed"],
  );
  assert.equal(a.job.billingBasis.baseTotal, 110);
  assert.equal(a.job.billingBasis.confirmed, true);
  assert.equal(
    a.tasks.find((t) => t.workflowAction === "schedule-work").assignedTo,
    admin,
  );
  assert.equal(
    a.tasks.find((t) => t.workflowAction === "installation-proof").assignedTo,
    installer,
  );
  const rows = (
    await db.query(
      "select collection,data from crm_records where id in ('quote-text','lead-text') order by collection",
    )
  ).rows;
  assert.equal(rows[0].data.preserved, true);
  assert.equal(rows[1].data.preserved, true);
  assert.equal(rows[1].data.linkedJobId, "job-text");
  assert.equal(
    (await db.query("select count(*)::int n from job_orders")).rows[0].n,
    0,
  );
  await assert.rejects(
    command("job-text", 0, "from_quote", { ...args, reason: "Different" }, key),
    /different inputs/,
  );
  await assert.rejects(
    command("job-text", 1, "from_quote", args, key),
    /revision zero/,
  );
  await assert.rejects(
    command("duplicate-text", 0, "from_quote", args),
    /already has a job/,
  );
});
test("inventory quotation retains picking/collection, correct pricing and pick list without reserving twice", async () => {
  await actor();
  const key = op(),
    args = { quoteId: "stock-quote", installerId: installer };
  const a = await command("stock-job", 0, "from_quote", args, key);
  await command("stock-job", 0, "from_quote", args, key);
  assert.ok(a.job.stages.some((s) => s.type === "Picking"));
  assert.ok(a.job.stages.some((s) => s.type === "Collected"));
  assert.equal(a.job.billingBasis.lines[0].unitGross, 110);
  assert.equal(a.job.items[0].quantityReserved, 0);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from crm_records where collection='pickLists' and data->>'jobId'='stock-job'",
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (await db.query("select count(*)::int n from stock_reservations")).rows[0]
      .n,
    0,
  );
});
test("existing create operation requires no quotation", async () => {
  await actor();
  const r = await command("direct-job", 0, "create", {
    customer: "Direct",
    workType: "repair",
  });
  assert.equal(r.job.leadId, undefined);
  assert.equal(r.job.quoteId, undefined);
  assert.equal(r.job.customer, "Direct");
  assert.equal(
    r.job.stages.some((s) => s.type === "Picking"),
    false,
  );
});
test("stale revisions, unexpected fields, unknown operations and unauthorized users are rejected atomically", async () => {
  await actor();
  await assert.rejects(command("job-text", 0, "reconcile"), /another session/);
  await assert.rejects(
    command("unknown", 0, "anything"),
    /Unknown workflow operation/,
  );
  await assert.rejects(
    command("bad", 0, "create", { customer: "Bad", items: [] }),
    /Unexpected field/,
  );
  await actor(installer);
  await assert.rejects(
    command("denied", 0, "create", { customer: "Denied" }),
    /management/,
  );
  await actor("");
  await assert.rejects(
    command("anonymous", 0, "create", { customer: "Denied" }),
    /management/,
  );
  await actor();
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from crm_records where id in ('bad','denied','anonymous','unknown')",
      )
    ).rows[0].n,
    0,
  );
});
test("task permission failure rolls back the job, quote, lead and receipt", async () => {
  await actor();
  await record("quotes", "failed-quote", {
    leadId: "lead-text",
    status: "Accepted",
    number: "QUOTE-3",
    total: 0,
    items: [],
  });
  await db.exec("reset role");
  await db.exec("insert into test_grants values('tasks','create',false)");
  await actor();
  const key = op();
  await assert.rejects(
    command("failed-job", 0, "from_quote", { quoteId: "failed-quote" }, key),
    /tasks.create/,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from crm_records where id='failed-job'",
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from private.crm_job_workflow_operations where id=$1",
        [key],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select data->>'linkedJobId' id from crm_records where id='failed-quote'",
      )
    ).rows[0].id,
    null,
  );
  await db.exec("reset role");
  await db.exec("delete from test_grants where module='tasks'");
});
test("product and manual-stage operations preserve history and dependencies across revisions", async () => {
  await actor();
  let r = await command("direct-job", 1, "product", {
    productId: variant,
    name: "Motor",
    sku: "M",
    quantityRequired: 1,
    unitGross: 20,
    priceConfirmed: true,
  });
  const line = r.job.items[0];
  assert.ok(r.job.stages.some((s) => s.type === "Picking" && s.applicable));
  r = await command("direct-job", 2, "stage", {
    name: "Check access",
    type: "Custom",
    after: "Confirmed",
    taskTitle: "Safety",
    assignedTo: installer,
    requiredEvidence: "before",
  });
  const manual = r.job.stages.find((s) => s.origin === "manual");
  r = await command("direct-job", 3, "product", {
    id: line.id,
    productId: variant,
    quantityRequired: 1,
    cancelled: true,
    unitGross: 20,
    priceConfirmed: true,
  });
  assert.equal(
    r.job.stages.find((s) => s.type === "Picking").applicable,
    false,
  );
  assert.ok(r.job.stages.some((s) => s.id === manual.id));
  r = await command("direct-job", 4, "reconcile");
  assert.equal(r.tasks.filter((t) => t.title === "Safety").length, 1);
  assert.equal(r.job.variations.length, 2);
  await assert.rejects(
    command("direct-job", 5, "stage", {
      id: "Confirmed",
      type: "Custom",
      name: "Skip",
    }),
    /validation type/,
  );
});
test("completed jobs require explicit reopening and preserve completion evidence history", async () => {
  await actor();
  await db.exec(
    `update crm_records set data=data||'{"status":"Completed","completedAt":"2026-10-01"}' where id='direct-job'`,
  );
  await assert.rejects(command("direct-job", 5, "reconcile"), /reopen/);
  const r = await command("direct-job", 5, "reopen", { target: "On Hold" });
  assert.equal(r.job.status, "On Hold");
  assert.equal(r.job.reopenHistory[0].previousCompletion, "2026-10-01");
});
test("new SQL uses invoker rights, safe search paths, RLS receipts and authenticated-only execute", async () => {
  await db.exec("reset role");
  const { rows } = await db.query(
    "select p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') staff from pg_proc p where p.proname='crm_job_workflow_command'",
  );
  assert.equal(rows[0].prosecdef, false);
  assert.ok(rows[0].proconfig.some((x) => x.startsWith("search_path=")));
  assert.equal(rows[0].anon, false);
  assert.equal(rows[0].staff, true);
  assert.equal(
    (
      await db.query(
        "select relrowsecurity from pg_class where oid='private.crm_job_workflow_operations'::regclass",
      )
    ).rows[0].relrowsecurity,
    true,
  );
});
