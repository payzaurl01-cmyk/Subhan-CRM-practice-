import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createJobApprovalBackend,
  canApproveJobs,
  sameReviewedWork,
} from "../src/features/crm/job-approval-backend.js";

test("reviewer UI requires an active management role and explicit jobs view/approve permissions", () => {
  const context = {
    profile: { role: "manager", status: "active" },
    modules: [{ key: "jobs", can_view: true, can_approve: true }],
  };
  assert.equal(canApproveJobs(context), true);
  for (const role of ["admin", "super_admin"])
    assert.equal(
      canApproveJobs({ ...context, profile: { ...context.profile, role } }),
      true,
    );
  assert.equal(
    canApproveJobs({
      ...context,
      profile: { role: "installer", status: "active" },
    }),
    false,
  );
  assert.equal(
    canApproveJobs({
      ...context,
      profile: { role: "admin", status: "blocked" },
    }),
    false,
  );
  assert.equal(
    canApproveJobs({
      ...context,
      modules: [{ key: "jobs", can_view: true, can_approve: false }],
    }),
    false,
  );
});
test("material work comparison ignores finance and key order, but detects changed evidence and tasks' parent work", () => {
  const a = {
    id: "j1",
    status: "Completed",
    items: [{ quantityUsed: 2, id: "i1" }],
    installationProof: [{ blobId: "one" }],
    outstanding: 100,
  };
  assert.equal(
    sameReviewedWork(a, {
      ...a,
      items: [{ id: "i1", quantityUsed: 2 }],
      outstanding: 0,
      timeline: ["Viewed"],
    }),
    true,
  );
  assert.equal(
    sameReviewedWork(a, { ...a, installationProof: [{ blobId: "two" }] }),
    false,
  );
  assert.equal(
    sameReviewedWork(a, { ...a, status: "Installation in Progress" }),
    false,
  );
  assert.equal(sameReviewedWork(a, null), false);
});
test("approval adapter uses authenticated RPCs, exact revision and confirmed response; errors never become success", async () => {
  const calls = [];
  let response = {
    data: {
      id: "approval1",
      job_id: "j1",
      revision: 4,
      approval_status: "Approved",
    },
  };
  const backend = createJobApprovalBackend({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return response;
    },
  });
  assert.equal(
    (await backend.approve("j1", 4, " Checked ")).approval_status,
    "Approved",
  );
  assert.deepEqual(calls[0], {
    name: "approve_completed_job",
    args: { p_job_id: "j1", p_revision: 4, p_notes: "Checked" },
  });
  response = { error: { message: "Job changed since review" } };
  await assert.rejects(
    backend.approve("j1", 4, ""),
    /Job changed since review/,
  );
  assert.equal(calls.length, 2, "does not automatically retry");
  response = { data: {} };
  await assert.rejects(backend.approve("j1", 4, ""), /did not confirm/);
  await assert.rejects(backend.load(), /did not confirm approval data/);
  response = { data: false };
  await assert.rejects(backend.read("n1"), /not confirmed/);
});
