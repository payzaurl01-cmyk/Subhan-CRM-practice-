import { test, expect, type Page } from "@playwright/test";
const state = (page: Page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("ibs-standalone-crm-v1") || "{}"),
  );
async function login(page: Page, role = "admin") {
  await page.goto("/");
  await page
    .locator(`[data-action="select-account"][data-email="${role}@demo.com"]`)
    .click();
  await page.locator('[data-form="login"] button[type="submit"]').click();
  await expect(page.locator(".app-shell")).toBeVisible();
}
async function create(page: Page, type = "repair") {
  await login(page);
  await page.locator('.side-nav [data-page="jobs"]').click();
  await page.getByRole("button", { name: "Create job", exact: true }).click();
  await page
    .getByLabel("Customer", { exact: true })
    .fill("Workflow acceptance");
  await page.getByLabel("Work type", { exact: true }).selectOption(type);
  await page
    .getByLabel("Assigned installer", { exact: true })
    .selectOption("u-installer");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Disposable workflow test");
  await page.locator('[data-action="workflow-save"]').click();
  await expect(page.locator("#job-workflow-form")).toHaveCount(0);
  return (await state(page)).jobs.find(
    (j: any) => j.customer === "Workflow acceptance",
  ).id;
}
test("new no-stock repair and manual stages persist after reload without warehouse tasks", async ({
  page,
}) => {
  const id = await create(page);
  let data = await state(page),
    j = data.jobs.find((j: any) => j.id === id);
  expect(j.stages.map((s: any) => s.type)).toEqual([
    "Confirmed",
    "Repair Scheduled",
    "Repair in Progress",
    "Completed",
  ]);
  expect(
    data.tasks.filter(
      (t: any) =>
        t.jobId === id &&
        ["Picking", "Collection", "Warehouse"].includes(t.category),
    ),
  ).toHaveLength(0);
  await page.locator('[data-action="workflow-stage"]').click();
  await page
    .getByLabel("Stage name", { exact: true })
    .fill("Site safety check");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Check safe access");
  await page
    .getByLabel("Required task title", { exact: true })
    .fill("Check access");
  await page
    .getByLabel("Task assignee", { exact: true })
    .selectOption("u-installer");
  await page.getByLabel("Reason", { exact: true }).fill("Safety required");
  await page.locator('[data-action="workflow-save"]').click();
  await expect(page.locator("#job-workflow-form")).toHaveCount(0);
  await page.reload();
  data = await state(page);
  j = data.jobs.find((j: any) => j.id === id);
  expect(
    j.stages.some(
      (s: any) => s.name === "Site safety check" && s.origin === "manual",
    ),
  ).toBe(true);
  expect(
    data.tasks.filter((t: any) => t.jobId === id && t.title === "Check access"),
  ).toHaveLength(1);
});
test("adding and excluding a product recalculates stock steps once and retains its variation history", async ({
  page,
}) => {
  const id = await create(page);
  await page.locator('[data-action="workflow-product"]').click();
  await page.getByLabel("Required quantity", { exact: true }).fill("1");
  await page
    .getByLabel("Confirmed variation unit price (including tax)", {
      exact: true,
    })
    .fill("25");
  await page.locator('[name="priceConfirmed"]').check();
  await page.getByLabel("Reason", { exact: true }).fill("Replacement motor");
  await page.locator('[data-action="workflow-save"]').click();
  await expect(page.locator("#job-workflow-form")).toHaveCount(0);
  let j = (await state(page)).jobs.find((j: any) => j.id === id);
  expect(
    j.stages.filter((s: any) => s.type === "Picking" && s.applicable),
  ).toHaveLength(1);
  const line = j.items[0];
  await page.locator('[data-action="workflow-product"]').click();
  await page.getByLabel("Existing line", { exact: true }).selectOption(line.id);
  await page.getByLabel("Line state", { exact: true }).selectOption("true");
  await page.locator('[name="priceConfirmed"]').check();
  await page.getByLabel("Reason", { exact: true }).fill("No motor required");
  await page.locator('[data-action="workflow-save"]').click();
  await expect(page.locator("#job-workflow-form")).toHaveCount(0);
  j = (await state(page)).jobs.find((j: any) => j.id === id);
  expect(j.items[0].cancelled).toBe(true);
  expect(j.stages.find((s: any) => s.type === "Picking").applicable).toBe(
    false,
  );
  expect(j.variations).toHaveLength(2);
});
test("no-stock repair completes with saved work evidence; denied GPS retains media and retry uses device location", async ({
  page,
}) => {
  const id = await create(page);
  // Exercise the real task/status controls. The assigned installer may schedule
  // ahead; management can also finish required tasks through the existing controls.
  await page
    .locator('[data-action="job-status"][data-status="Repair Scheduled"]')
    .click();
  const schedule = (await state(page)).tasks.find(
    (t: any) => t.jobId === id && t.workflowAction === "schedule-work",
  );
  await page
    .locator(`[data-action="task-complete"][data-id="${schedule.id}"]`)
    .click();
  await page
    .locator('[data-action="job-status"][data-status="Repair in Progress"]')
    .click();
  const work = (await state(page)).tasks.find(
    (t: any) => t.jobId === id && t.workflowAction === "perform-work",
  );
  await page
    .locator(`[data-action="task-complete"][data-id="${work.id}"]`)
    .click();
  await page.locator('[data-action="close-modal"]').first().click();
  await page.locator('[data-page="profile"]').first().click();
  await page.locator('[data-action="logout"]').first().click();
  await login(page, "installer");
  await page.locator('.side-nav [data-page="jobs"]').click();
  await page.locator(`[data-action="open-job-work"][data-id="${id}"]`).click();
  await page.locator('[data-action="job-tab"][data-tab="photos"]').click();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: (_ok: any, fail: any) => fail({ code: 1 }) },
    });
  });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  await page
    .locator("input[data-install-proof]:not([data-proof-phase])")
    .first()
    .setInputFiles({ name: "repair.png", mimeType: "image/png", buffer: png });
  await expect(
    page.getByRole("button", { name: "Retry evidence location", exact: true }),
  ).toBeVisible();
  let j = (await state(page)).jobs.find((j: any) => j.id === id);
  expect(j.installationProof).toHaveLength(1);
  expect(j.installationProof[0].pendingLocation).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (ok: any) =>
          ok({
            coords: { latitude: 24.91, longitude: 67.12, accuracy: 8 },
            timestamp: Date.now(),
          }),
      },
    });
  });
  await page
    .getByRole("button", { name: "Retry evidence location", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry evidence location", exact: true }),
  ).toHaveCount(0);
  j = (await state(page)).jobs.find((j: any) => j.id === id);
  expect(j.installationProof).toHaveLength(1);
  expect(j.installationProof[0].location.latitude).toBe(24.91);
  await page.locator('[data-action="job-tab"][data-tab="overview"]').click();
  await page
    .locator('[data-action="job-status"][data-status="Completed"]')
    .click();
  j = (await state(page)).jobs.find((j: any) => j.id === id);
  expect(j.status).toBe("Completed");
  expect(j.approvalStatus).not.toBe("Approved");
});
