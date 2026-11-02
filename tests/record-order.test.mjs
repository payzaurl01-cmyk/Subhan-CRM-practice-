import { test } from "node:test";
import assert from "node:assert/strict";
import {
  jobCreatedTime,
  jobTaskOrder,
  newestFirst,
  newestJobsFirst,
} from "../src/features/crm/record-order.js";

test("jobs use their creation event, not their latest update or appointment", () => {
  const older = {
    id: "old",
    installationDate: "2026-12-01",
    timeline: [{ at: "2026-10-30T12:00:00Z" }, { at: "2026-10-01T12:00:00Z" }],
  };
  const newer = {
    id: "new",
    timeline: [{ at: "2026-10-20T12:00:00Z" }],
  };
  assert.equal(jobCreatedTime(older), Date.parse("2026-10-01T12:00:00Z"));
  assert.deepEqual([older, newer].sort(newestJobsFirst), [newer, older]);
});

test("tasks group under newest jobs while keeping stage one before later stages", () => {
  const jobs = new Map([
    ["old", { id: "old", createdAt: "2026-10-01T00:00:00Z" }],
    ["new", { id: "new", createdAt: "2026-10-20T00:00:00Z" }],
  ]);
  const tasks = [
    {
      id: "old-task",
      jobId: "old",
      jobStage: "First",
      createdAt: "2026-10-02",
    },
    { id: "last", jobId: "new", jobStage: "Last", createdAt: "2026-10-22" },
    { id: "first", jobId: "new", jobStage: "First", createdAt: "2026-10-21" },
  ];
  const rank = (stage) => ["First", "Last"].indexOf(stage);
  assert.deepEqual(
    tasks
      .sort((a, b) => jobTaskOrder(a, b, (id) => jobs.get(id), rank))
      .map((t) => t.id),
    ["first", "last", "old-task"],
  );
  assert.deepEqual(
    [{ createdAt: "2026-10-01" }, { createdAt: "2026-10-20" }]
      .sort(newestFirst)
      .map((x) => x.createdAt),
    ["2026-10-20", "2026-10-01"],
  );
});
