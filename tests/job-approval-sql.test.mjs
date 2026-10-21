import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

let db;
const actors = Object.fromEntries(
  ["super_admin", "admin", "manager", "installer", "other"].map((role) => [
    role,
    randomUUID(),
  ]),
);
async function login(role = "admin", revoked = false) {
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('test.revoked',$2,false)",
    [actors[role], String(revoked)],
  );
}
async function put(collection, data) {
  await db.query(
    "insert into public.crm_records(collection,id,data) values($1,$2,$3::jsonb) on conflict(collection,id) do update set data=excluded.data",
    [collection, data.id, JSON.stringify(data)],
  );
}
async function job(extra = {}) {
  await login();
  const id = randomUUID();
  const data = {
    id,
    number: `JOB-${id.slice(0, 8)}`,
    status: "Completed",
    customer: "Review customer",
    installerId: actors.installer,
    items: [],
    photos: [],
    installationProof: [
      {
        id: randomUUID(),
        blobId: `media-${id}`,
        kind: "photo",
        userId: actors.installer,
        createdAt: "2026-10-21T09:00:00Z",
        location: {
          latitude: -33.8,
          longitude: 151.2,
          accuracy: 10,
          source: "Device geolocation",
        },
      },
    ],
    ...extra,
  };
  await db.query(
    "insert into storage.objects(bucket_id,name) values('crm-media',$1)",
    [data.installationProof[0]?.blobId || `media-${id}`],
  );
  await put("jobs", data);
  return data;
}
const snapshot = async () =>
  (await db.query("select public.job_approval_snapshot() s")).rows[0].s;
const state = async (id) =>
  (
    await db.query("select * from public.job_approval_state where job_id=$1", [
      id,
    ])
  ).rows[0];
const approve = async (id, revision, notes = "Verified all work") =>
  (
    await db.query("select public.approve_completed_job($1,$2,$3) r", [
      id,
      revision,
      notes,
    ])
  ).rows[0].r;
const approveLatest = async (id) => approve(id, (await state(id)).revision);

before(async () => {
  db = new PGlite();
  await db.exec(
    await readFile(
      new URL("./fixtures/job-approval-baseline.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    "insert into public.system_modules(key) values('jobs'); insert into public.permissions(key,module_id,action) select 'jobs.'||a,id,a from public.system_modules cross join unnest(array['view','update','approve']) a;",
  );
  for (const [role, id] of Object.entries(actors)) {
    const key = role === "other" ? "installer" : role;
    await db.query(
      "insert into public.roles(key,name) values($1,$1) on conflict do nothing",
      [key],
    );
    const email =
      role === "super_admin"
        ? "annasabbas01@gmail.com"
        : `${role}@example.test`;
    await db.query("insert into auth.users values($1,$2,now(),null);", [
      id,
      email,
    ]);
    await db.query(
      "insert into public.profiles(id,role_id,email,full_name) values($1,(select id from roles where key=$2),$3,$4)",
      [id, key, email, `${role} Reviewer`],
    );
  }
  await db.exec(
    "insert into public.role_permissions select r.id,p.id,'allow' from public.roles r cross join public.permissions p;",
  );
  // An existing completed job must never be automatically approved by migration.
  await put("jobs", {
    id: "existing-completed",
    status: "Completed",
    installerId: actors.installer,
  });
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261021093841_completed_job_approval.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await login();
});
after(async () => db?.close());

test("existing and newly completed jobs start pending with deduplicated authorized reviewer notifications", async () => {
  assert.equal(
    (await snapshot()).jobs.find((j) => j.job_id === "existing-completed")
      .approval_status,
    "Pending Approval",
  );
  const j = await job();
  const result = await snapshot();
  assert.equal(
    result.jobs.find((x) => x.job_id === j.id).approval_status,
    "Pending Approval",
  );
  const notices = (
    await db.query(
      "select user_id from public.job_approval_notifications where job_id=$1",
      [j.id],
    )
  ).rows;
  assert.deepEqual(
    new Set(notices.map((n) => n.user_id)),
    new Set([actors.admin, actors.manager, actors.super_admin]),
  );
  await put("jobs", { ...j, timeline: [{ title: "Viewed" }] });
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.job_approval_notifications where job_id=$1",
        [j.id],
      )
    ).rows[0].n,
    3,
  );
});
test("Admin, Manager and Super Admin can approve, persist notes/history and notify installer exactly once", async () => {
  for (const role of ["admin", "manager", "super_admin"]) {
    const j = await job();
    const rev = (await state(j.id)).revision;
    const invoice = {
      id: `invoice-${j.id}`,
      jobId: j.id,
      status: "Unpaid",
      balance: 200,
      total: 200,
    };
    await put("invoices", invoice);
    await login(role);
    await db.exec("set role authenticated");
    const first = await approve(j.id, rev, "Reviewed location and returns");
    assert.equal(first.approval_status, "Approved");
    assert.deepEqual(await approve(j.id, rev), first);
    const entry = (await snapshot()).jobs.find((x) => x.job_id === j.id);
    assert.equal(entry.approved_by, actors[role]);
    assert.equal(entry.review_notes, "Reviewed location and returns");
    assert.ok(entry.approved_at);
    assert.deepEqual(
      (
        await db.query(
          "select data from public.crm_records where collection='invoices' and id=$1",
          [invoice.id],
        )
      ).rows[0].data,
      invoice,
    );
    await db.exec("reset role");
    await login("installer");
    assert.equal(
      (await snapshot()).notifications.filter(
        (n) => n.job_id === j.id && n.event === "approved",
      ).length,
      1,
    );
  }
});
test("backend rejects incomplete jobs, pending tasks, returns and absent stored evidence", async () => {
  const j = await job({ status: "Installation in Progress" });
  await assert.rejects(approveLatest(j.id), /Only Completed/);
  j.status = "Completed";
  await put("jobs", j);
  assert.equal(
    (await snapshot()).jobs.find((x) => x.job_id === j.id).approval_status,
    "Pending Approval",
  );
  const t = {
    id: randomUUID(),
    jobId: j.id,
    status: "Pending",
    title: "Required task",
  };
  await put("tasks", t);
  await assert.rejects(approveLatest(j.id), /all linked tasks/);
  await put("tasks", { ...t, status: "Completed" });
  const r = { id: randomUUID(), jobId: j.id, status: "Draft" };
  await put("returns", r);
  await assert.rejects(approveLatest(j.id), /all relevant returns/);
  await put("returns", { ...r, status: "Processed" });
  await db.query("delete from storage.objects where name=$1", [
    j.installationProof[0].blobId,
  ]);
  await assert.rejects(approveLatest(j.id), /Saved installation evidence/);
  await db.query(
    "insert into storage.objects(bucket_id,name,archived_at,is_delete_marker) values('crm-media',$1,now(),true)",
    [j.installationProof[0].blobId],
  );
  await assert.rejects(approveLatest(j.id), /Saved installation evidence/);
  await db.query(
    "update storage.objects set archived_at=null,is_delete_marker=false where name=$1",
    [j.installationProof[0].blobId],
  );
  assert.equal((await approveLatest(j.id)).approval_status, "Approved");
});
test("installer with approve grant, denied reviewers and revoked sessions cannot approve", async () => {
  const j = await job();
  const rev = (await state(j.id)).revision;
  await login("installer");
  await assert.rejects(approve(j.id, rev), /Permission denied/);
  await login("admin", true);
  await assert.rejects(approve(j.id, rev), /Permission denied/);
  await login();
  await db.query(
    "insert into public.user_permissions(user_id,permission_id,effect) select $1,id,'deny' from public.permissions where key='jobs.approve'",
    [actors.admin],
  );
  await assert.rejects(approve(j.id, rev), /Permission denied/);
  await db.query("delete from public.user_permissions where user_id=$1", [
    actors.admin,
  ]);
});
test("reopening, work, tasks, returns and saved media changes revoke approval and preserve history", async () => {
  for (const change of ["reopen", "work", "task", "return", "media"]) {
    const j = await job();
    await approveLatest(j.id);
    const previous = await state(j.id);
    if (change === "reopen")
      await put("jobs", { ...j, status: "Installation in Progress" });
    if (change === "work")
      await put("jobs", { ...j, items: [{ id: "new", quantityUsed: 2 }] });
    if (change === "task")
      await put("tasks", {
        id: randomUUID(),
        jobId: j.id,
        status: "Completed",
        notes: "Changed scope",
      });
    if (change === "return")
      await put("returns", {
        id: randomUUID(),
        jobId: j.id,
        status: "Processed",
        condition: "Damaged",
      });
    if (change === "media")
      await db.query(
        "update storage.objects set version=gen_random_uuid()::text,updated_at=now() where name=$1",
        [j.installationProof[0].blobId],
      );
    assert.equal((await state(j.id)).approval_id, null);
    assert.ok((await state(j.id)).revision > previous.revision);
    const h = (await snapshot()).history.find(
      (x) => x.id === previous.approval_id,
    );
    assert.ok(h.invalidated_at);
    assert.ok(h.invalidation_reason);
    if (change === "reopen") await put("jobs", j);
    assert.equal(
      (await snapshot()).jobs.find((x) => x.job_id === j.id).approval_status,
      "Pending Approval",
    );
    await assert.rejects(
      approve(j.id, previous.revision),
      /Job changed since review/,
    );
    await approveLatest(j.id);
    assert.equal(
      (await snapshot()).history.filter((x) => x.job_id === j.id).length,
      2,
    );
  }
});
test("direct JSON tampering cannot approve; finance and timeline changes preserve existing approval", async () => {
  const j = await job();
  await assert.rejects(
    put("jobs", { ...j, status: "Approved" }),
    /separate from operational/,
  );
  await login("installer");
  await db.exec("set role authenticated");
  await put("jobs", {
    ...j,
    approvalStatus: "Approved",
    approved_by: actors.admin,
    approvedAt: new Date().toISOString(),
  });
  await assert.rejects(
    db.query(
      "update public.job_approval_state set approval_id=gen_random_uuid() where job_id=$1",
      [j.id],
    ),
    /permission denied/,
  );
  await assert.rejects(
    db.query(
      "insert into public.job_approval_history(job_id,revision,reviewer_name,review_snapshot) values($1,1,'Fake','{}')",
      [j.id],
    ),
    /permission denied/,
  );
  await db.exec("reset role");
  await login();
  assert.equal((await state(j.id)).approval_id, null);
  await approveLatest(j.id);
  const prior = await state(j.id);
  await db.query(
    "update storage.objects set last_accessed_at=now(),updated_at=now() where name=$1",
    [j.installationProof[0].blobId],
  );
  assert.equal(
    (await state(j.id)).approval_id,
    prior.approval_id,
    "reading evidence must not invalidate approval",
  );
  await put("jobs", {
    ...j,
    outstanding: 12,
    financialHold: true,
    timeline: [{ title: "Invoice reminder" }],
  });
  assert.equal((await state(j.id)).approval_id, prior.approval_id);
  assert.equal(
    (
      await db.query(
        "select data ? 'approvalStatus' forged from public.crm_records where collection='jobs' and id=$1",
        [j.id],
      )
    ).rows[0].forged,
    false,
  );
});
test("RLS protects other users' notifications and unrelated installer jobs", async () => {
  const j = await job();
  await approveLatest(j.id);
  await login("other");
  await db.exec("set role authenticated");
  assert.equal(
    (
      await db.query(
        "select * from public.job_approval_state where job_id=$1",
        [j.id],
      )
    ).rows.length,
    0,
  );
  assert.equal((await snapshot()).jobs.length, 0);
  assert.equal(
    (await db.query("select * from public.job_approval_notifications")).rows
      .length,
    0,
  );
  await assert.rejects(put("jobs", j), /Assigned job required/);
  await db.exec("reset role");
  await login();
});
test("warehouse allocation returns participate in review, completion checks and invalidation", async () => {
  // Simulate applying the independent warehouse extension after this migration.
  await db.exec(
    "create table public.inventory_job_allocations(id uuid primary key,job_id text); alter table public.product_return_items add column inventory_allocation_id uuid references public.inventory_job_allocations;",
  );
  const j = await job();
  await approveLatest(j.id);
  const allocation = randomUUID(),
    ret = randomUUID(),
    item = randomUUID();
  await db.query("insert into public.inventory_job_allocations values($1,$2)", [
    allocation,
    j.id,
  ]);
  await db.query(
    "insert into public.product_returns(id,workflow_status,reason) values($1,'draft','Unused blind')",
    [ret],
  );
  await db.query(
    "insert into public.product_return_items(id,product_return_id,quantity,inventory_allocation_id) values($1,$2,2,$3)",
    [item, ret, allocation],
  );
  assert.equal((await state(j.id)).approval_id, null);
  await assert.rejects(approveLatest(j.id), /all warehouse returns/);
  const result = await snapshot();
  assert.equal(
    result.inventory_returns.find((r) => r.id === ret).items[0].quantity,
    2,
  );
  await db.query(
    "update public.product_return_items set usable_quantity=2,damaged_quantity=0 where id=$1",
    [item],
  );
  await db.query(
    "update public.product_returns set delivered_at=now(),inventory_posted_at=now() where id=$1",
    [ret],
  );
  await approveLatest(j.id);
  await db.query(
    "update public.product_return_items set usable_quantity=1,damaged_quantity=1 where id=$1",
    [item],
  );
  assert.equal((await state(j.id)).approval_id, null);
  assert.ok(
    (await snapshot()).history
      .filter((h) => h.job_id === j.id)
      .every((h) => h.invalidated_at),
  );
  await approveLatest(j.id);
  await db.query("delete from public.product_return_items where id=$1", [item]);
  assert.equal((await state(j.id)).approval_id, null);
});

test("pending job deletion is allowed while jobs with review history remain protected", async () => {
  const pending = await job();
  await db.query(
    "delete from public.crm_records where collection='jobs' and id=$1",
    [pending.id],
  );
  assert.equal(await state(pending.id), undefined);
  const reviewed = await job();
  await approveLatest(reviewed.id);
  await assert.rejects(
    db.query(
      "delete from public.crm_records where collection='jobs' and id=$1",
      [reviewed.id],
    ),
    /foreign key/,
  );
  await put("jobs", { ...reviewed, status: "Installation in Progress" });
  await assert.rejects(
    db.query(
      "delete from public.crm_records where collection='jobs' and id=$1",
      [reviewed.id],
    ),
    /foreign key/,
  );
});

test("notification recipients honor personal denies, module locks and blocked accounts", async () => {
  await login();
  await db.query(
    "insert into public.user_permissions(user_id,permission_id,effect) select $1,id,'deny' from public.permissions where key='jobs.approve'",
    [actors.manager],
  );
  const j = await job();
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.job_approval_notifications where job_id=$1 and user_id=$2",
        [j.id, actors.manager],
      )
    ).rows[0].n,
    0,
  );
  await db.query("delete from public.user_permissions where user_id=$1", [
    actors.manager,
  ]);
  await db.exec(
    "insert into public.module_access_rules(module_id,scope_type,platform,access_state) select id,'global','web','locked' from public.system_modules where key='jobs'",
  );
  const locked = await job();
  assert.deepEqual(
    (
      await db.query(
        "select user_id from public.job_approval_notifications where job_id=$1",
        [locked.id],
      )
    ).rows.map((x) => x.user_id),
    [actors.super_admin],
  );
  await db.exec("delete from public.module_access_rules");
  await db.query("update public.profiles set status='blocked' where id=$1", [
    actors.manager,
  ]);
  assert.equal(
    (
      await db.query("select private.job_review_recipient($1) permitted", [
        actors.manager,
      ])
    ).rows[0].permitted,
    false,
  );
});
