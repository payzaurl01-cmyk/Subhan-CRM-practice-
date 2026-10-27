import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultStageTypes,
  stockFacts,
  reconcileWorkflow,
  updateProduct,
  editStage,
  completionError,
  nextStage,
} from "../src/features/crm/job-workflow.js";
import { createJobWorkflowBackend } from "../src/features/crm/job-workflow-backend.js";
const job = (workType = "installation", items = []) => ({
  id: "job",
  number: "JOB-test",
  status: "Confirmed",
  workType,
  items,
  installerId: "installer",
  timeline: [],
});
const line = (extra = {}) => ({
  id: "motor",
  kind: "Inventory",
  productId: "variant",
  quantityRequired: 2,
  quantityIssued: 0,
  ...extra,
});
for (const type of ["installation", "repair", "supply"])
  test(`${type} without company inventory has only applicable stages and tasks`, () => {
    const input = job(type, [
      { kind: "Labour", quantityRequired: 4 },
      { kind: "Service", quantity: 1 },
      {
        kind: "Inventory",
        productId: "customer",
        fulfilmentSource: "customer",
        quantityRequired: 1,
      },
      line({ quantityRequired: 0 }),
      line({ cancelled: true }),
    ]);
    const plan = reconcileWorkflow(input, []);
    const expected =
      type === "supply"
        ? ["Confirmed", "Completed"]
        : [
            "Confirmed",
            type === "repair" ? "Repair Scheduled" : "Installation Scheduled",
            type === "repair"
              ? "Repair in Progress"
              : "Installation in Progress",
            "Completed",
          ];
    assert.deepEqual(
      plan.job.stages.map((s) => s.type),
      expected,
    );
    assert.equal(
      plan.tasks.some((t) =>
        ["Picking", "Collection", "Warehouse"].includes(t.category),
      ),
      false,
    );
    assert.equal(nextStage(plan.job), expected[1]);
  });
test("outstanding physical goods produce stock stages, shortage appears only when required and unavailable", () => {
  assert.deepEqual(defaultStageTypes(job("repair", [line()])), [
    "Confirmed",
    "Picking",
    "Ready for Collection",
    "Collected",
    "Repair Scheduled",
    "Repair in Progress",
    "Completed",
  ]);
  assert.ok(
    defaultStageTypes(job("repair", [line()]), { shortage: true }).includes(
      "Stock Shortage",
    ),
  );
  assert.equal(
    defaultStageTypes(job("repair"), { shortage: true }).includes(
      "Stock Shortage",
    ),
    false,
  );
  assert.equal(
    stockFacts(job("repair", [line({ quantityIssued: 2 })])).outstanding,
    0,
  );
  assert.equal(
    defaultStageTypes(job("repair", [line({ quantityIssued: 2 })])).includes(
      "Picking",
    ),
    false,
  );
});
test("repeated recalculation preserves manual/completed work, removes unnecessary outstanding generated steps and does not duplicate tasks", () => {
  let plan = reconcileWorkflow(job("repair", [line()]), []);
  plan.job.stages.push({
    id: "manual",
    origin: "manual",
    type: "Custom",
    name: "Inspection",
    after: "Confirmed",
    applicable: true,
    status: "Pending",
  });
  plan.tasks.push({
    id: "done",
    jobId: "job",
    jobStage: "Confirmed",
    status: "Completed",
    completedAt: "2026-01-01",
    assignedTo: "original",
  });
  plan.job.items[0].cancelled = true;
  plan = reconcileWorkflow(plan.job, plan.tasks);
  assert.equal(
    plan.job.stages.find((s) => s.type === "Picking").applicable,
    false,
  );
  assert.equal(
    plan.tasks.find((t) => t.workflowAction === "confirm-location").status,
    "Not applicable",
  );
  assert.ok(plan.job.stages.some((s) => s.id === "manual"));
  assert.deepEqual(
    plan.tasks.find((t) => t.id === "done"),
    {
      id: "done",
      jobId: "job",
      jobStage: "Confirmed",
      status: "Completed",
      completedAt: "2026-01-01",
      assignedTo: "original",
    },
  );
  const again = reconcileWorkflow(plan.job, plan.tasks);
  assert.equal(again.tasks.length, plan.tasks.length);
});
test("mid-repair stock addition retains current stage and evidence and blocks final completion, unrelated work is unchanged", () => {
  const input = {
    ...job("repair"),
    status: "Repair in Progress",
    installationProof: [{ id: "old-evidence" }],
  };
  const updated = updateProduct(
    input,
    {
      productId: "motor",
      name: "Motor",
      quantityRequired: 1,
      priceConfirmed: true,
      unitGross: 10,
    },
    { id: "new-line", reason: "Replacement needed" },
  );
  const plan = reconcileWorkflow(updated, [
    {
      id: "finished",
      jobId: "job",
      status: "Completed",
      completedAt: "earlier",
      jobStage: "Repair in Progress",
    },
  ]);
  assert.equal(plan.job.status, "Repair in Progress");
  assert.deepEqual(plan.job.installationProof, input.installationProof);
  assert.ok(
    plan.tasks.some(
      (t) => t.workflowAction === "confirm-location" && t.status === "Pending",
    ),
  );
  assert.match(completionError(plan.job, plan.tasks), /company-stock/);
});
test("issued/reserved/consumed obligations cannot disappear through exclusion or variant replacement", () => {
  for (const changes of [
    { quantityReserved: 2 },
    { quantityPicked: 2 },
    { quantityIssued: 2 },
    { quantityIssued: 2, quantityUsed: 2 },
  ])
    assert.throws(
      () =>
        updateProduct(
          job("repair", [line(changes)]),
          {
            id: "motor",
            productId: "variant",
            quantityRequired: 0,
            cancelled: true,
          },
          { reason: "Exclude" },
        ),
      /reservation|return|Consumed|picking/i,
    );
  assert.throws(
    () =>
      editStage(
        job("repair", [line()]),
        { name: "Skip picking", type: "Picking", applicable: false },
        { id: "manual", reason: "Skip" },
      ),
    /prerequisite/,
  );
});
test("completed jobs require reopening and completed stage definitions cannot be edited", () => {
  assert.throws(
    () =>
      updateProduct(
        { ...job(), status: "Completed" },
        { quantityRequired: 1 },
        { reason: "Change" },
      ),
    /Reopen/,
  );
  const input = {
    ...job(),
    stages: [
      {
        id: "done",
        status: "Completed",
        type: "Custom",
        name: "Done",
        completedAt: "earlier",
      },
    ],
  };
  assert.throws(
    () =>
      editStage(input, { id: "done", name: "Rename" }, { reason: "Change" }),
    /Completed/,
  );
  assert.deepEqual(
    reconcileWorkflow({ ...input, status: "Completed" }, []).job,
    { ...input, status: "Completed" },
  );
});
test("workflow adapter uses exact version and retry identity, requires a confirmed snapshot and surfaces backend errors", async () => {
  const calls = [];
  let error = null;
  const backend = createJobWorkflowBackend({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: { job: { id: "job" }, tasks: [] }, error };
    },
  });
  await backend.command("job", 4, "stage", { reason: "Reason" }, "operation");
  assert.deepEqual(calls[0], {
    name: "crm_job_workflow_command",
    args: {
      p_job_id: "job",
      p_revision: 4,
      p_operation: "stage",
      p_payload: { reason: "Reason" },
      p_operation_id: "operation",
    },
  });
  error = { message: "Access revoked" };
  await assert.rejects(
    backend.command("job", 4, "stage", {}, "op"),
    /Access revoked/,
  );
  assert.equal(calls.length, 2);
});

test("confirmed variations feed billing adjustments without changing accepted totals or double-crediting returns", async () => {
  const { variationAdjustments } =
    await import("../src/features/crm/job-workflow.js");
  const input = {
    ...job(),
    value: 220,
    billingBasis: {
      baseTotal: 220,
      confirmed: true,
      lines: [{ itemId: "motor", unitGross: 110 }],
    },
    variations: [
      {
        id: "add",
        lineId: "new",
        before: null,
        after: { quantityRequired: 1 },
        unitGross: 50,
        priceConfirmed: true,
      },
      {
        id: "remove-unissued",
        lineId: "motor",
        before: { quantityRequired: 2 },
        after: { quantityRequired: 1 },
        unitGross: 110,
        priceConfirmed: true,
      },
      {
        id: "return-issued",
        lineId: "motor",
        before: { quantityRequired: 1, quantityIssued: 1, quantityReturned: 1 },
        after: { quantityRequired: 0 },
        unitGross: 110,
        priceConfirmed: true,
      },
    ],
  };
  const snapshot = structuredClone(input);
  const adjustments = variationAdjustments(input);
  assert.deepEqual(
    adjustments.map((v) => v.amount),
    [50, -110, 0],
  );
  assert.deepEqual(input, snapshot);
});

test("successive confirmed price and quantity variations use the latest line price while retaining the accepted basis", async () => {
  const { variationAdjustments } =
    await import("../src/features/crm/job-workflow.js");
  let input = {
    ...job("repair", [line({ quantityRequired: 1, approvedUnitGross: 100 })]),
    billingBasis: {
      baseTotal: 100,
      lines: [{ itemId: "motor", unitGross: 100 }],
      confirmed: true,
    },
  };
  input = updateProduct(
    input,
    {
      id: "motor",
      productId: "variant",
      quantityRequired: 1,
      unitGross: 150,
      priceConfirmed: true,
    },
    { id: "price", reason: "Confirmed revised price" },
  );
  input = updateProduct(
    input,
    {
      id: "motor",
      productId: "variant",
      quantityRequired: 2,
      unitGross: 150,
      priceConfirmed: true,
    },
    { id: "quantity", reason: "Add a second motor" },
  );
  assert.deepEqual(
    variationAdjustments(input).map((v) => v.amount),
    [50, 150],
  );
  assert.equal(input.billingBasis.baseTotal, 100);
});

test("workflow retry retains its revision and operation id after a lost response and realtime refresh", async () => {
  const { createJobWorkflowControls } =
    await import("../src/features/crm/job-workflow-controls.js");
  const original = globalThis.FormData;
  globalThis.FormData = class {
    *[Symbol.iterator]() {
      yield ["reason", "Retry verification"];
    }
  };
  try {
    const job = { id: "retry-job", workflowRevision: 3 },
      calls = [],
      notices = [];
    let applied = 0;
    const controls = createJobWorkflowControls({
      ctx: {
        esc: String,
        root: { addEventListener() {}, removeEventListener() {} },
        canManageJobDetails: () => true,
        jobOf: () => job,
        $: () => ({ reportValidity: () => true }),
        toast: (...args) => notices.push(args),
      },
      render() {},
      apply() {
        applied++;
      },
      backend: {
        async command(...args) {
          calls.push(args);
          if (calls.length === 1) {
            job.workflowRevision = 4;
            throw Error("Lost response");
          }
          return { job, tasks: [] };
        },
      },
    });
    await controls.handle({
      dataset: { action: "workflow-reconcile", id: job.id },
    });
    await controls.handle({ dataset: { action: "workflow-save" } });
    assert.equal(applied, 0);
    assert.equal(notices.length, 0);
    await controls.handle({ dataset: { action: "workflow-save" } });
    assert.deepEqual(calls[0], calls[1]);
    assert.equal(calls[1][1], 3);
    assert.equal(applied, 1);
    assert.equal(notices.length, 1);
  } finally {
    globalThis.FormData = original;
  }
});
