import { test, expect, type Page } from "@playwright/test";
const state = async (page: Page) =>
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
test("all admin screens, history navigation, and reload render without errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  const modules = [
    "dashboard",
    "chat",
    "leads",
    "contacts",
    "quotes",
    "jobs",
    "tasks",
    "calendar",
    "inventory",
    "picking",
    "returns",
    "purchasing",
    "billing",
    "reports",
    "users",
    "email",
    "logs",
    "profile",
  ];
  for (const module of modules) {
    await page.locator(`.side-nav [data-page="${module}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/crm/${module}$`));
    await expect(page.locator(".content")).not.toBeEmpty();
  }
  await page.goBack();
  await expect(page).toHaveURL(/\/crm\/logs$/);
  await page.reload();
  await expect(page.locator(".app-shell")).toBeVisible();
  await page.goto("/crm/unknown");
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("create a lead, retain it across reload, and generate a client report", async ({
  page,
}) => {
  await login(page);
  await page.locator('.side-nav [data-page="leads"]').click();
  await page.locator('[data-action="new-lead"]').click();
  await page
    .locator('#new-lead-form [name="customer"]')
    .fill("Next Port Customer");
  await page.locator('#new-lead-form [name="phone"]').fill("0400123456");
  await page
    .locator('#new-lead-form [name="email"]')
    .fill("next-port@example.com");
  await page.locator('[data-action="create-lead"]').click();
  expect(
    (await state(page)).leads.filter(
      (x: any) => x.customer === "Next Port Customer",
    ),
  ).toHaveLength(1);
  await page.reload();
  await expect(page.locator(".app-shell")).toBeVisible();
  expect(
    (await state(page)).leads.some(
      (x: any) => x.customer === "Next Port Customer",
    ),
  ).toBe(true);
  await page.locator('.side-nav [data-page="reports"]').click();
  await page.locator("[data-report-type]").selectOption("leads");
  await page.locator('[data-action="generate-report"]').click();
  await expect(page.locator('[data-action="preview-report"]')).toBeVisible();
  await expect(page.locator(".content")).toContainText("Next Port Customer");
});
test("supplier creation and PO receiving preserve inventory workflow", async ({
  page,
}) => {
  await login(page);
  await page.locator('.side-nav [data-page="purchasing"]').click();
  await page.locator('[data-action="new-supplier"]').click();
  await page.locator('#supplier-form [name="name"]').fill("Next Port Supplier");
  await page
    .locator('#supplier-form [name="email"]')
    .fill("supplier@example.com");
  await page.locator('[data-action="save-supplier"]').click();
  expect(
    (await state(page)).suppliers.some(
      (x: any) => x.name === "Next Port Supplier",
    ),
  ).toBe(true);
  const before = await state(page);
  const outstanding = before.purchaseOrders.find(
    (x: any) => x.status !== "Received",
  );
  // The supplied prototype receives remaining quantities in one action.

  await page.locator('.side-nav [data-page="purchasing"]').click();
  const tabs = page.locator(
    '[data-action="purchasing-tab"][data-tab="Purchase Orders"]',
  );
  if (await tabs.count()) await tabs.click();
  const button = page.locator(
    `[data-action="receive-po"][data-id="${outstanding.id}"]`,
  );
  await button.click();
  const after = await state(page);
  expect(
    after.purchaseOrders.find((x: any) => x.id === outstanding.id).status,
  ).toBe("Received");
  expect(after.stockMovements.length).toBeGreaterThan(
    before.stockMovements.length,
  );
});
test("installer visibility restricts finance and other installers jobs", async ({
  page,
}) => {
  await login(page, "installer");
  await expect(page.locator('.side-nav [data-page="billing"]')).toHaveCount(0);
  await expect(page.locator('.side-nav [data-page="users"]')).toHaveCount(0);
  await page.locator('.side-nav [data-page="jobs"]').click();
  const data = await state(page);
  const hidden = data.jobs.find(
    (x: any) => x.installerId && x.installerId !== "u-installer",
  );
  if (hidden)
    await expect(page.locator(".content")).not.toContainText(hidden.number);
  await page.goto("/crm/billing");
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator(".topbar-title")).not.toContainText("Billing");
});
test("owner setup opens master controls without contacting live backend", async ({
  page,
}) => {
  const live: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes(".supabase.co")) live.push(r.url());
  });
  await page.goto("/owner");
  const form = page.locator('[data-form="owner-login"]');
  await expect(form).toBeVisible();
  await form.locator('[name="password"]').fill("local-owner-password-2026");
  await form.locator('[name="confirm"]').fill("local-owner-password-2026");
  await form.locator('button[type="submit"]').click();
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator('.side-nav [data-page="master"]')).toBeVisible();
  await page.locator('.side-nav [data-page="jobs"]').click();
  await expect(page).toHaveURL(/\/owner\/jobs$/);
  await page.reload();
  await expect(page.locator(".app-shell")).toBeVisible();
  expect(live).toEqual([]);
});
test("mobile workspace navigation remains usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.locator(".mobile-tabs")).toBeVisible();
  await page.locator('.mobile-tabs [data-page="jobs"]').click();
  await expect(page.locator(".content")).not.toBeEmpty();
  await expect(page).toHaveURL(/\/crm\/jobs$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
