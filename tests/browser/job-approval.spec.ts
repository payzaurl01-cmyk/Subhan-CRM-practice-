import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sameReviewedWork } from "../../src/features/crm/job-approval-backend.js";

function job(id: string, status = "Completed") {
  return {
    id,
    number: id === "j1" ? "JOB-APPROVAL" : "JOB-INCOMPLETE",
    customer: "Approval Customer",
    status,
    installerId: "installer",
    service: "Blind installation",
    address: "20 Review Road",
    suburb: "Sydney",
    phone: "0400000000",
    warehouse: "Main",
    installationDate: "2026-10-21",
    value: 200,
    outstanding: 200,
    financialHold: false,
    items: [],
    extraItems: [],
    timeline: [],
    photos: [
      {
        id: "before",
        type: "Before",
        uri: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
        createdAt: "2026-10-20T10:00:00Z",
      },
    ],
    installationProof: [
      {
        id: "proof",
        blobId: `media-${id}`,
        kind: "photo",
        mimeType: "image/png",
        name: "After blind installation",
        userId: "installer",
        createdAt: "2026-10-21T10:00:00Z",
        location: {
          latitude: -33.8,
          longitude: 151.2,
          accuracy: 5,
          source: "Device geolocation",
          capturedAt: "2026-10-21T10:00:00Z",
        },
      },
    ],
  };
}
async function service(context: BrowserContext) {
  const server: any = {
    jobs: [job("j1"), job("j2", "Installation in Progress")],
    tasks: [
      {
        id: "task1",
        title: "Install all blinds",
        jobId: "j1",
        jobStage: "Installation in Progress",
        assignedTo: "installer",
        status: "Completed",
        category: "Installation",
        priority: "High",
        dueAt: "2026-10-21",
      },
    ],
    returns: [
      {
        id: "return1",
        number: "RET-REVIEW",
        jobId: "j1",
        status: "Processed",
        condition: "Unused",
        items: [],
        forms: [],
      },
    ],
    states: { j1: { revision: 1 }, j2: { revision: 1 } },
    history: [],
    notifications: [],
    calls: [],
    deny: false,
    error: "",
  };
  for (const role of ["admin", "manager", "super_admin"])
    server.notifications.push({
      id: `n-${role}`,
      user_id: role,
      job_id: "j1",
      revision: 1,
      event: "pending",
      title: "Job approval required",
      body: "JOB-APPROVAL needs review",
      created_at: "2026-10-21T10:00:00Z",
    });
  server.change = (id: string, extra: any) => {
    Object.assign(
      server.jobs.find((j: any) => j.id === id),
      extra,
    );
    const s = server.states[id];
    if (s.approval_id) {
      const h = server.history.find((h: any) => h.id === s.approval_id);
      h.invalidated_at = new Date().toISOString();
      h.invalidation_reason = "Job work or evidence changed";
    }
    s.approval_id = null;
    s.revision++;
  };
  await context.route("**/__approval-fixture/api", async (route) => {
    const { name, args, role } = route.request().postDataJSON();
    server.calls.push({ name, args, role });
    let data: any;
    let error = "";
    const visible = (j: any) => role !== "installer" || j.installerId === role;
    if (name === "access")
      data = {
        profile: {
          id: role,
          role,
          email: `${role}@example.test`,
          full_name: `${role} Staff`,
          status: "active",
        },
        modules: [
          "dashboard",
          "jobs",
          "tasks",
          "warehouse",
          "reports",
          "billing",
          "users",
          "settings",
        ].map((key) => ({
          key,
          can_view:
            role !== "installer" ||
            !["reports", "billing", "users", "settings"].includes(key),
          can_update: true,
          can_approve: role !== "installer" && !server.deny,
        })),
      };
    if (name === "records")
      data = {
        jobs: server.jobs.filter(visible),
        tasks: server.tasks,
        returns: server.returns,
        invoices: [
          {
            id: "invoice1",
            jobId: "j1",
            number: "INV-UNPAID",
            status: "Unpaid",
            total: 200,
            balance: 200,
            issuedAt: "2026-10-21",
            dueDate: "2026-11-21",
          },
        ],
      };
    if (name === "sync") {
      for (const incoming of args.jobs || []) {
        const prior = server.jobs.find((j: any) => j.id === incoming.id);
        if (prior && !sameReviewedWork(prior, incoming))
          server.change(incoming.id, incoming);
      }
      data = true;
    }
    if (name === "job_approval_snapshot")
      data = {
        jobs: server.jobs.filter(visible).map((j: any) => ({
          job: j,
          job_id: j.id,
          ...server.states[j.id],
          approval_status:
            j.status !== "Completed"
              ? "Not Ready"
              : server.states[j.id].approval_id
                ? "Approved"
                : "Pending Approval",
          ...server.history.find(
            (h: any) => h.id === server.states[j.id].approval_id,
          ),
        })),
        tasks: server.tasks,
        returns: server.returns,
        history: server.history,
        inventory_returns: [
          {
            id: "warehouse-return",
            jobId: "j1",
            source: "inventory",
            number: "RET-WAREHOUSE",
            status: "Processed",
            reason: "Warehouse inspection complete",
            items: [
              {
                variant_id: "variant1",
                quantity: 2,
                usable_quantity: 2,
                damaged_quantity: 0,
              },
            ],
          },
        ],
        notifications: server.notifications.filter(
          (n: any) =>
            n.user_id === role &&
            (n.event === "approved" ||
              (!server.deny &&
                server.states[n.job_id].revision === n.revision &&
                !server.states[n.job_id].approval_id)),
        ),
      };
    if (name === "approve_completed_job") {
      if (server.beforeApprove) {
        const change = server.beforeApprove;
        server.beforeApprove = null;
        change();
      }
      const j = server.jobs.find((j: any) => j.id === args.p_job_id),
        s = server.states[args.p_job_id];
      if (role === "installer" || server.deny)
        error = "jobs.approve permission revoked";
      else if (server.error) error = server.error;
      else if (j.status !== "Completed")
        error = "Only Completed jobs can be approved";
      else if (s.revision !== args.p_revision)
        error = "Job changed since review. Refresh and review it again";
      else {
        s.approval_id ||= `approval-${server.history.length + 1}`;
        if (!server.history.some((h: any) => h.id === s.approval_id)) {
          server.history.push({
            id: s.approval_id,
            job_id: j.id,
            revision: s.revision,
            approved_by: role,
            reviewer_name: `${role} Staff`,
            approved_at: new Date().toISOString(),
            review_notes: args.p_notes,
          });
          server.notifications.push({
            id: `approved-${s.approval_id}`,
            user_id: "installer",
            job_id: j.id,
            revision: s.revision,
            event: "approved",
            title: "Job approved",
            body: "Your job was approved",
            created_at: new Date().toISOString(),
          });
        }
        data = {
          id: s.approval_id,
          job_id: j.id,
          revision: s.revision,
          approval_status: "Approved",
        };
      }
    }
    if (name === "read_job_approval_notification") {
      const n = server.notifications.find(
        (n: any) => n.id === args.p_id && n.user_id === role,
      );
      if (n) {
        n.read_at = new Date().toISOString();
        data = true;
      } else error = "Notification update was not confirmed";
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(error ? { error: { message: error } } : { data }),
    });
  });
  return server;
}
async function mount(page: Page, role = "admin") {
  let styles: string[] = [];
  await page.route("**/__approval-fixture/**", async (route) => {
    const name = new URL(route.request().url()).pathname.slice(
      "/__approval-fixture/".length,
    );
    if (name === "api") {
      await route.fallback();
      return;
    }
    if (name === "host.html") {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head>${styles.map((h) => `<link rel="stylesheet" href="${h}">`).join("")}</head><body></body></html>`,
      });
      return;
    }
    const file =
      name === "fixture.js"
        ? path.resolve("tests/fixtures/hosted-job-approval.js")
        : path.resolve(
            "src/features/crm",
            name.endsWith(".js") ? name : `${name}.js`,
          );
    await route.fulfill({
      contentType: "application/javascript",
      body: await readFile(file, "utf8"),
    });
  });
  await page.route("**/*.supabase.co/**", (route) => route.abort());
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) => links.map((l) => (l as HTMLLinkElement).href));
  await page.goto("/__approval-fixture/host.html");
  await page.evaluate(async (role) => {
    const url = "/__approval-fixture/fixture.js";
    await (await import(url)).mount(role);
  }, role);
  await expect(page.locator('.job-card[data-id="j1"]')).toContainText(
    "Completed",
  );
}
async function review(page: Page, id = "j1") {
  const clear = page.locator('.content [data-action="clear-work-context"]');
  if (await clear.count()) await clear.click();
  await page.locator(`.job-card[data-id="${id}"]`).click();
  await page.locator('[data-action="approval-review"]').click();
  await expect(page.locator("[data-job-review]")).toBeVisible();
}
const approveButton = (page: Page) =>
  page.getByRole("button", { name: "Approve Job", exact: true });

test("review, approval notes, badges, refresh, reports and installer notification persist", async ({
  page,
  context,
}) => {
  const server = await service(context);
  await mount(page, "manager");
  await page
    .locator('[data-filter="jobFilter"]')
    .selectOption("Pending Approval");
  await expect(page.locator(".job-card")).toHaveCount(1);
  await review(page);
  await expect(page.locator("[data-job-review]")).toContainText(
    "Install all blinds",
  );
  await expect(page.locator("[data-job-review]")).toContainText("RET-REVIEW");
  await expect(page.locator("[data-job-review]")).toContainText(
    "RET-WAREHOUSE",
  );
  await expect(page.locator("[data-job-review]")).toContainText(
    "Returned 2 · Usable 2 · Damaged 0",
  );
  await expect(page.locator("[data-job-review]")).toContainText("-33.800000");
  await page
    .getByLabel("Review notes (optional)")
    .fill("All evidence and returns checked");
  await approveButton(page).click();
  await expect(page.locator("[data-job-approval]")).toContainText(
    "Approved by manager Staff",
  );
  expect(server.history).toHaveLength(1);
  await page.locator('[data-action="close-modal"]').first().click();
  await page.locator('[data-filter="jobFilter"]').selectOption("Approved");
  await expect(page.locator('.job-card[data-id="j1"]')).toContainText(
    "Completed",
  );
  await expect(page.locator('.job-card[data-id="j1"]')).toContainText(
    "Approved",
  );
  await page.locator('.side-nav [data-page="reports"]').click();
  await page
    .locator('#business-report-form [name="type"]')
    .selectOption("jobs");
  await page.locator('#business-report-form [name="status"]').fill("Approved");
  await page
    .getByRole("button", { name: "Generate Report", exact: true })
    .click();
  await expect(page.locator(".email-sheet")).toContainText("manager Staff");
  await expect(page.locator(".email-sheet")).toContainText("Approved at");
  await page.reload();
  await page.evaluate(async () => {
    const url = "/__approval-fixture/fixture.js";
    await (await import(url)).mount("manager");
  });
  await expect(page.locator('.job-card[data-id="j1"]')).toContainText(
    "Approved",
  );
  const installer = await context.newPage();
  await mount(installer, "installer");
  await installer
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await installer
    .getByRole("button", { name: /Job approved Your job was approved/ })
    .click();
  await expect(installer.locator("[data-job-approval]")).toContainText(
    "manager Staff",
  );
  expect(
    server.notifications.find((n: any) => n.event === "approved").read_at,
  ).toBeTruthy();
  expect(
    server.calls.filter((c: any) => c.name === "approve_completed_job"),
  ).toHaveLength(1);
  expect(server.calls.find((c: any) => c.name === "records")).toBeTruthy();
});
test("installers, incomplete jobs and revoked reviewer permissions cannot use approval", async ({
  page,
  context,
}) => {
  const server = await service(context);
  await mount(page, "installer");
  await review(page);
  await expect(approveButton(page)).toHaveCount(0);
  await page.locator('[data-action="close-modal"]').first().click();
  await review(page, "j2");
  await expect(page.locator("[data-job-review]")).toContainText(
    "Complete this job before approval",
  );
  await expect(approveButton(page)).toHaveCount(0);
  const admin = await context.newPage();
  await mount(admin);
  await review(admin);
  await expect(approveButton(admin)).toBeEnabled();
  server.deny = true;
  await admin.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(approveButton(admin)).toHaveCount(0);
  expect(server.history).toHaveLength(0);
});
test("a stale review and actual backend errors never show approval success or retry automatically", async ({
  page,
  context,
}) => {
  const server = await service(context);
  await mount(page);
  await review(page);
  server.beforeApprove = () =>
    server.change("j1", { notes: "Changed on another device" });
  await approveButton(page).click();
  await expect(page.locator("#toasts")).toContainText(
    "Job changed since review",
  );
  expect(server.history).toHaveLength(0);
  expect(
    server.calls.filter((c: any) => c.name === "approve_completed_job"),
  ).toHaveLength(1);
  await page
    .getByRole("button", { name: "Refresh review", exact: true })
    .click();
  server.error = "Database unavailable: review was not saved";
  await approveButton(page).click();
  await expect(page.locator("#toasts")).toContainText(server.error);
  expect(server.history).toHaveLength(0);
  await expect(page.locator("[data-job-review]")).toContainText(
    "Pending Approval",
  );
});
test("work changes revoke approval, retain history and require a fresh review", async ({
  page,
  context,
}) => {
  const server = await service(context);
  await mount(page);
  await review(page);
  await approveButton(page).click();
  await expect(page.locator("[data-job-approval]")).toContainText(
    "Approved by admin Staff",
  );
  server.change("j1", { notes: "Updated installation scope" });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator("[data-job-review]")).toContainText("Invalidated");
  await expect(approveButton(page)).toBeDisabled();
  await expect(page.locator("[data-job-review]")).toContainText(
    "Pending Approval",
  );
  await page
    .getByRole("button", { name: "Refresh review", exact: true })
    .click();
  await approveButton(page).click();
  await expect(page.locator("[data-job-approval]")).toContainText(
    "Approved by admin Staff",
  );
  expect(server.history).toHaveLength(2);
});
