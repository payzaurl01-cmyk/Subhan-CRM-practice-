import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function hosted(page: Page, role = "manager") {
  let styles: string[] = [];
  await page.route("**/__account-fixture/**", async (route) => {
    const name = new URL(route.request().url()).pathname.slice(
      "/__account-fixture/".length,
    );
    if (name === "host.html") {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head>${styles.map((href) => `<link rel="stylesheet" href="${href}">`).join("")}</head><body></body></html>`,
      });
      return;
    }
    const root = name === "fixture.js" ? "tests/fixtures" : "src/features/crm";
    const file =
      name === "fixture.js"
        ? "hosted-accounts.js"
        : name.endsWith(".js")
          ? name
          : `${name}.js`;
    const source = await readFile(path.resolve(root, file), "utf8");
    await route.fulfill({
      contentType: "application/javascript",
      body: source,
    });
  });
  await page.route("**/*.supabase.co/**", (route) => route.abort());
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    );
  // Run the imperative runtime outside React's DOM ownership in this fixture.
  await page.goto("/__account-fixture/host.html");
  await page.evaluate(async (role) => {
    const fixtureUrl = "/__account-fixture/fixture.js";
    const module = await import(/* webpackIgnore: true */ fixtureUrl);
    await module.mount(role);
  }, role);
  await expect(page.locator(".app-shell")).toBeVisible();
}
const staffRow = (page: Page) =>
  page.locator("tr").filter({ hasText: "target@example.com" });
const calls = (page: Page, name: string) =>
  page.evaluate(
    (name) =>
      (window as any).accountFixture.calls.filter(
        (call: any) => call.name === name,
      ),
    name,
  );

for (const role of ["admin", "manager", "super_admin"]) {
  test(`${role} manages accounts from the normal CRM dashboard`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await hosted(page, role);
    await expect(page).toHaveURL(/\/crm\/users$/);
    await staffRow(page).getByRole("button", { name: "Edit profile" }).click();
    await page.getByLabel("Full name", { exact: true }).fill("Updated Staff");
    await page.getByLabel("Phone", { exact: true }).fill("0412345678");
    await page.locator('[data-action="account-save"]').click();
    await expect(staffRow(page)).toContainText("Updated Staff");
    await staffRow(page)
      .getByRole("button", { name: "Change role", exact: true })
      .click();
    await page.locator('#account-form [name="role"]').selectOption("admin");
    await page.locator('[data-action="account-save"]').click();
    await expect(staffRow(page)).toContainText("Admin");
    await expect
      .poll(async () => (await calls(page, "admin_update_user_access")).length)
      .toBe(1);
    await staffRow(page)
      .getByRole("button", { name: "Block", exact: true })
      .click();
    await expect(staffRow(page)).toContainText("blocked");
    await staffRow(page)
      .getByRole("button", { name: "Unblock", exact: true })
      .click();
    await expect(staffRow(page)).toContainText("active");
    await page.locator('.side-nav [data-page="dashboard"]').click();
    await expect(page).toHaveURL(/\/crm\/dashboard$/);
    expect(errors).toEqual([]);
    if (role !== "super_admin")
      await expect(page.getByText("Individual overrides")).toHaveCount(0);
  });
}

test("deletion requires confirmation and surfaces backend restrictions", async ({
  page,
}) => {
  await hosted(page);
  await staffRow(page)
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  expect(await calls(page, "admin_delete_user")).toHaveLength(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(() => {
    (window as any).accountFixture.deletedError =
      "User has linked records or protected history";
  });
  await staffRow(page)
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.locator("#overlay")).toContainText(
    "User has linked records or protected history",
  );
  await expect(staffRow(page)).toBeVisible();
  expect(await calls(page, "admin_delete_user")).toHaveLength(1);
  await page.evaluate(() => {
    (window as any).accountFixture.deletedError = "";
  });
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(staffRow(page)).toHaveCount(0);
});

test("partial password completion clears secrets and does not retry", async ({
  page,
}) => {
  await hosted(page);
  await page.evaluate(() => {
    (window as any).accountFixture.partialPassword = true;
  });
  await staffRow(page).getByRole("button", { name: "Change password" }).click();
  await page
    .getByLabel("New password", { exact: true })
    .fill("test-password-2026");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("test-password-2026");
  await page.locator('[data-action="account-save"]').click();
  await expect(page.locator(".content")).toContainText(
    "Password changed, but session cleanup or auditing did not complete",
  );
  expect(await calls(page, "owner-change-password")).toHaveLength(1);
  await staffRow(page).getByRole("button", { name: "Change password" }).click();
  await expect(page.getByLabel("New password", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByLabel("Confirm password", { exact: true }),
  ).toHaveValue("");
  expect(await calls(page, "owner-change-password")).toHaveLength(1);
});

test("focus revocation closes stale dialogs and reconnect removes blocked users", async ({
  page,
}) => {
  await hosted(page);
  await staffRow(page)
    .getByRole("button", { name: "Change role", exact: true })
    .click();
  await page.evaluate(() => {
    (window as any).accountFixture.context.modules.find(
      (module: any) => module.key === "users",
    ).can_change_role = false;
    window.dispatchEvent(new Event("focus"));
  });
  await expect(page.locator("#account-form")).toHaveCount(0);
  await expect(
    staffRow(page).getByRole("button", { name: "Change role", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).accountFixture.accessError = "Active profile required";
    window.dispatchEvent(new Event("online"));
  });
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText(
    "Active profile required",
  );
});

test("Super Admin role and user permission controls call backend and refresh", async ({
  page,
}) => {
  await hosted(page, "super_admin");
  await page
    .locator(
      '[data-action="account-role-permission"][data-role="manager"][data-key="delete"]',
    )
    .click();
  await expect(
    page.locator(
      '[data-action="account-role-permission"][data-role="manager"][data-key="delete"]',
    ),
  ).toHaveText("Restore");
  const roleCalls = await calls(page, "admin_set_role_permission");
  expect(roleCalls[0].args).toEqual({
    p_role_key: "manager",
    p_permission_key: "users.delete",
    p_effect: "deny",
  });
  await page
    .locator("#account-permission-user")
    .selectOption(
      await page.evaluate(() => (window as any).accountFixture.targetId),
    );
  await page
    .locator(
      '[data-action="account-user-permission"][data-key="delete"][data-effect="deny"]',
    )
    .click();
  await expect
    .poll(async () => (await calls(page, "admin_set_user_permission")).length)
    .toBe(1);
  await page
    .locator(
      '[data-action="account-user-permission"][data-key="delete"][data-effect="default"]',
    )
    .click();
  await expect
    .poll(async () => (await calls(page, "admin_set_user_permission")).length)
    .toBe(2);
  const owner = page
    .locator("tr")
    .filter({ hasText: "annasabbas01@gmail.com" });
  await expect(owner).toContainText("Protected Super Admin");
  await expect(
    owner.getByRole("button", { name: "Delete", exact: true }),
  ).toHaveCount(0);
  await expect(
    owner.getByRole("button", { name: "Block", exact: true }),
  ).toHaveCount(0);
});

test("mobile account actions fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await hosted(page, "manager");
  const card = page
    .locator(".mobile-card")
    .filter({ hasText: "target@example.com" });
  await expect(
    card.getByRole("button", { name: "Change password" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
