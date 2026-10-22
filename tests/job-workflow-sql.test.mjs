import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
let db;
const admin = "10000000-0000-4000-8000-000000000001",
  installer = "10000000-0000-4000-8000-000000000002",
  variant = "30000000-0000-4000-8000-000000000001";
let counter = 0;
const operation = () =>
  `40000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
async function actor(id = admin) {
  await db.exec("reset role");
  await db.query("select set_config('test.actor',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function command(id, revision, action, payload, op = operation()) {
  await actor();
  return (
    await db.query("select crm_job_workflow_command($1,$2,$3,$4,$5) result", [
      id,
      revision,
      action,
      JSON.stringify({ reason: "Disposable verification", ...payload }),
      op,
    ])
  ).rows[0].result;
}
before(async () => {
  db = new PGlite();
  await db.exec(
    await readFile(
      new URL("./fixtures/job-workflow-baseline.sql", import.meta.url),
      "utf8",
    ),
  );
  const baseline = JSON.parse(
    await readFile(
      new URL("./fixtures/job-deployed-contract.json", import.meta.url),
      "utf8",
    ),
  );
  for (const f of baseline.functions.filter(
    (f) => f.name === "accept_quotation_and_create_job",
  ))
    await db.exec(f.definition);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261022141817_conditional_job_workflow.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
});
after(async () => db?.close());
test("manual no-inventory repairs generate repair-only stages and idempotent tasks", async () => {
  const op = operation(),
    payload = {
      customer: "Disposable repair",
      workType: "repair",
      installerId: installer,
    };
  const a = await command("repair", 0, "create", payload, op),
    b = await command("repair", 0, "create", payload, op);
  assert.deepEqual(a, b);
  assert.deepEqual(
    a.job.stages.map((s) => s.type),
    ["Confirmed", "Repair Scheduled", "Repair in Progress", "Completed"],
  );
  assert.equal(
    a.tasks.some((t) => ["Picking", "Collection"].includes(t.category)),
    false,
  );
  const c = await command("repair", 1, "reconcile", {});
  assert.equal(c.tasks.length, a.tasks.length);
});
test("product changes add only outstanding stock steps; exclusion preserves history and removes unused generated work", async () => {
  let r = await command("stock-change", 0, "create", {
    customer: "Disposable install",
    workType: "installation",
  });
  r = await command("stock-change", 1, "product", {
    productId: variant,
    name: "Motor",
    quantityRequired: 2,
    unitGross: 10,
    priceConfirmed: true,
  });
  assert.ok(r.job.stages.some((s) => s.type === "Picking" && s.applicable));
  const line = r.job.items[0];
  r = await command("stock-change", 2, "product", {
    ...line,
    priceConfirmed: true,
    cancelled: true,
    quantityRequired: 2,
  });
  assert.ok(r.job.items[0].cancelled);
  assert.ok(
    r.job.stages.find((s) => s.type === "Picking").applicable === false,
  );
  assert.equal(
    r.tasks.filter(
      (t) => t.category === "Picking" && t.status !== "Not applicable",
    ).length,
    0,
  );
});
test("manual stages retain their system type and persist across recalculation", async () => {
  let r = await command("manual", 0, "create", {
    customer: "Manual",
    workType: "repair",
  });
  r = await command("manual", 1, "stage", {
    name: "Safety inspection",
    type: "Custom",
    after: "Confirmed",
    taskTitle: "Inspect safety",
    assignedTo: installer,
    requiredEvidence: "before",
  });
  const stage = r.job.stages.find((s) => s.origin === "manual");
  assert.equal(r.job.stages[1].id, stage.id);
  r = await command("manual", 2, "reconcile", {});
  assert.ok(r.job.stages.some((s) => s.id === stage.id));
  assert.equal(r.tasks.filter((t) => t.jobStage === stage.id).length, 1);
});
test("backend rejects installers, stale revisions and completed edits", async () => {
  await actor(installer);
  await assert.rejects(
    db.query(
      "select crm_job_workflow_command('repair',2,'stage','{\"reason\":\"unauthorized\"}',$1)",
      [operation()],
    ),
    /management/,
  );
  await assert.rejects(
    command("repair", 0, "reconcile", {}),
    /another session/,
  );
  await actor();
  await assert.rejects(
    db.query(
      "update crm_records set data=data||'{\"status\":\"Completed\"}' where collection='jobs' and id='repair'",
    ),
    /required applicable tasks|evidence/,
  );
});
test("affected reservations and unissued picks release once, preserve on-hand stock and keep history", async () => {
  await db.exec("reset role");
  const job = "50000000-0000-4000-8000-000000000001",
    line = "50000000-0000-4000-8000-000000000002",
    balance = "50000000-0000-4000-8000-000000000003",
    reservation = "50000000-0000-4000-8000-000000000004";
  await db.query(
    "insert into job_order_items(id,job_order_id,quantity) values($1,$2,5)",
    [line, job],
  );
  await db.query(
    "insert into inventory_balances(id,quantity_reserved,quantity_on_hand) values($1,5,10)",
    [balance],
  );
  await db.query(
    "insert into stock_reservations(id,job_order_item_id,inventory_balance_id,quantity) values($1,$2,$3,5)",
    [reservation, line, balance],
  );
  await db.query(
    "insert into pick_list_items values(gen_random_uuid(),$1,5,4,now())",
    [reservation],
  );
  await actor();
  await db.query("insert into crm_records values('jobs',$1,$2)", [
    job,
    JSON.stringify({
      id: job,
      number: "Reserved",
      status: "Confirmed",
      workType: "repair",
      items: [
        {
          id: line,
          productId: variant,
          quantityRequired: 5,
          quantityReserved: 5,
          quantityPicked: 4,
          quantityMatched: 4,
        },
      ],
      timeline: [],
    }),
  ]);
  const op = operation(),
    args = {
      id: line,
      productId: variant,
      quantityRequired: 2,
      unitGross: 0,
      priceConfirmed: true,
    };
  await command(job, 0, "product", args, op);
  await command(job, 0, "product", args, op);
  await db.exec("reset role");
  assert.deepEqual(
    (
      await db.query(
        "select quantity_reserved,quantity_on_hand from inventory_balances where id=$1",
        [balance],
      )
    ).rows[0],
    { quantity_reserved: "2", quantity_on_hand: "10" },
  );
  assert.equal(
    (
      await db.query(
        "select quantity_released from stock_reservations where id=$1",
        [reservation],
      )
    ).rows[0].quantity_released,
    "3",
  );
});

test("service-only normalized quotation conversion creates repair scheduling without pick lists or reservations", async () => {
  await db.exec("reset role");
  const q = "60000000-0000-4000-8000-000000000001",
    l = "60000000-0000-4000-8000-000000000002";
  await db.query("insert into leads(id) values($1)", [l]);
  await db.query(
    "insert into quotations(id,lead_id,status) values($1,$2,'accepted')",
    [q, l],
  );
  await db.query(
    "insert into quotation_items(quotation_id,description,quantity,unit_price,tax_rate) values($1,'Labour',1,100,0.1)",
    [q],
  );
  await db.exec("insert into warehouses default values");
  await actor();
  const id = (
    await db.query("select accept_quotation_and_create_job($1,'repair') id", [
      q,
    ])
  ).rows[0].id;
  assert.equal(
    (
      await db.query(
        "select count(*)::int c from pick_lists where job_order_id=$1",
        [id],
      )
    ).rows[0].c,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int c from stock_reservations where job_order_id=$1",
        [id],
      )
    ).rows[0].c,
    0,
  );
  const tasks = (
    await db.query("select title,job_stage from tasks where job_order_id=$1", [
      id,
    ])
  ).rows;
  assert.deepEqual(tasks, [
    { title: "Schedule repair", job_stage: "Repair Scheduled" },
  ]);
});
test("direct requests cannot erase reserved/issued history or relabel a system stage to bypass validation", async () => {
  await actor();
  await assert.rejects(
    db.query(
      "update crm_records set data=jsonb_set(data,'{items,0,quantityReserved}','0') where collection='jobs' and id='50000000-0000-4000-8000-000000000001'",
    ),
    /transactional (stock|job workflow)/,
  );
  await assert.rejects(
    db.query(
      "update crm_records set data=jsonb_set(data,'{stages,0,type}','\"Custom\"') where collection='jobs' and id='repair'",
    ),
    /system validation type|transactional job workflow/,
  );
});
test("explicit reopening preserves completion history and requires new work; update-only management permission does not require create", async () => {
  let r = await command("supply", 0, "create", {
    customer: "Supply",
    workType: "supply",
  });
  await actor();
  await db.query(
    'update crm_records set data=data||\'{"status":"Completed","completedAt":"2026-10-01T00:00:00Z"}\' where collection=\'jobs\' and id=\'supply\'',
  );
  await assert.rejects(
    command("supply", 1, "stage", { name: "After completion", type: "Custom" }),
    /reopen/,
  );
  r = await command("supply", 1, "reopen", {});
  assert.ok(r.job.reopenedAt);
  assert.equal(r.job.reopenHistory.length, 1);
  assert.equal(
    r.job.reopenHistory[0].previousCompletion,
    "2026-10-01T00:00:00Z",
  );
  await db.exec("reset role");
  await db.exec(
    "insert into test_grants(module,action,allowed) values('jobs','create',false)",
  );
  r = await command("supply", 2, "stage", {
    name: "Inspection",
    type: "Custom",
    after: r.job.status,
  });
  assert.ok(r.job.stages.some((s) => s.name === "Inspection"));
  await db.exec("reset role");
  await db.exec("delete from test_grants where module='jobs'");
});
test("before evidence needs saved media but no GPS; after evidence completion requires real stored media and device GPS", async () => {
  let r = await command("evidence", 0, "create", {
    customer: "Evidence",
    workType: "repair",
    installerId: installer,
  });
  const proof = r.tasks.find((t) => t.workflowAction === "installation-proof");
  await actor(installer);
  await assert.rejects(
    db.query(
      "update crm_records set data=data||'{\"status\":\"Completed\"}' where collection='tasks' and id=$1",
      [proof.id],
    ),
    /after evidence/,
  );
  await actor();
  await db.exec("reset role");
  await db.exec(
    "insert into storage.objects(bucket_id,name) values('crm-media','before-media'),('crm-media','after-media')",
  );
  const before = {
    blobId: "before-media",
    kind: "photo",
    phase: "before",
    userId: installer,
    createdAt: new Date().toISOString(),
  };
  await db.query(
    "update crm_records set data=data||jsonb_build_object('installationProof',$1::jsonb) where collection='jobs' and id='evidence'",
    [JSON.stringify([before])],
  );
  await db.exec("reset role");
  assert.equal(
    (
      await db.query(
        "select private.crm_workflow_has_evidence(data,'before') ok from crm_records where collection='jobs' and id='evidence'",
      )
    ).rows[0].ok,
    true,
  );
  assert.equal(
    (
      await db.query(
        "select private.crm_workflow_has_evidence(data,'after') ok from crm_records where collection='jobs' and id='evidence'",
      )
    ).rows[0].ok,
    false,
  );
  const after = {
    ...before,
    blobId: "after-media",
    phase: "after",
    location: {
      source: "Device geolocation",
      latitude: 51,
      longitude: -0.1,
      accuracy: 10,
    },
  };
  await actor();
  await db.query(
    "update crm_records set data=data||jsonb_build_object('installationProof',$1::jsonb) where collection='jobs' and id='evidence'",
    [JSON.stringify([before, after])],
  );
  await actor(installer);
  await db.query(
    "update crm_records set data=data||jsonb_build_object('status','Completed','completedBy',$1::text) where collection='tasks' and id=$2",
    [installer, proof.id],
  );
});

test("targeted legacy correction uses quotation provenance, retargets scheduling and preserves completed work without duplicate tasks", async () => {
  await actor();
  const j = {
    id: "legacy-correction",
    number: "LEGACY",
    status: "Confirmed",
    service: "Installation",
    items: [],
    leadId: "legacy-lead",
    quoteId: "legacy-quote",
    timeline: [],
  };
  await db.query("insert into crm_records values('jobs',$1,$2)", [
    j.id,
    JSON.stringify(j),
  ]);
  const schedule = {
    id: "legacy-schedule",
    jobId: j.id,
    quoteId: j.quoteId,
    leadId: j.leadId,
    category: "Installation",
    jobStage: "Collected",
    status: "Pending",
    title: "Original generator schedule",
  };
  const work = {
    ...schedule,
    id: "legacy-work",
    jobStage: "Installation in Progress",
    status: "Completed",
    completedAt: "2026-10-01",
    assignedTo: installer,
  };
  await db.query(
    "insert into crm_records values('tasks',$1,$2),('tasks',$3,$4)",
    [schedule.id, JSON.stringify(schedule), work.id, JSON.stringify(work)],
  );
  let r = await command(j.id, 0, "reconcile", {});
  assert.equal(
    r.tasks.find((t) => t.id === schedule.id).jobStage,
    "Installation Scheduled",
  );
  assert.deepEqual(
    r.tasks.find((t) => t.id === work.id),
    work,
  );
  assert.equal(
    r.tasks.filter((t) => t.workflowAction === "perform-work").length,
    0,
  );
  r = await command(j.id, 1, "reconcile", {});
  assert.equal(
    r.tasks.filter((t) => t.workflowAction === "schedule-work").length,
    1,
  );
});
