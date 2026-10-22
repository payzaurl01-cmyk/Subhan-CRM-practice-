import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function hosted(page: Page, role = "manager") {
  let styles: string[] = [];
  await page.route("**/__account-fixture/**", async (route) => {
    const name = new URL(route.request().url()).pathname.slice(
      "/__account-fixture/".length,
    );
    if (name === "registry.json") {
      await route.fulfill({
        contentType: "application/json",
        body: await readFile(
          path.resolve("tests/fixtures/master-deployed-contract.json"),
          "utf8",
        ),
      });
      return;
    }
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
  await page.route("**/crm/dashboard", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head>${styles.map((href) => `<link rel="stylesheet" href="${href}">`).join("")}</head><body><script type="module">import('/__account-fixture/fixture.js').then(m=>m.mount('${role}'))</script></body></html>`,
    }),
  );
  await page.route("**/crm/master", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head>${styles.map((href) => `<link rel="stylesheet" href="${href}">`).join("")}</head><body><script type="module">import('/__account-fixture/fixture.js').then(m=>m.mount('${role}'))</script></body></html>`,
    }),
  );
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

test("Super Admin retains all five Master Control tabs and the full registry permission editor", async ({
  page,
}) => {
  await hosted(page, "super_admin");
  await page.locator('[data-page="master"]').first().click();
  for (const name of [
    "Overview",
    "Ultimate Control",
    "Access controls",
    "Accounts",
    "Security",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Security", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Owner account", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Set up an authenticator", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Active impersonation sessions",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accounts", exact: true }).click();
  await expect(
    staffRow(page).getByRole("button", { name: "Login as user", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Access controls", exact: true })
    .click();
  await expect(page.locator("#master-scope")).toBeVisible();
  await page.getByRole("button", { name: "Functions", exact: true }).click();
  await page.locator("#master-scope").selectOption("role");
  await page.locator("#master-target").selectOption({ label: "Manager" });
  await page
    .getByLabel("permission · users.change_password", { exact: true })
    .selectOption("deny");
  expect((await calls(page, "admin_set_role_permission")).at(-1).args).toEqual({
    p_role_key: "manager",
    p_permission_key: "users.change_password",
    p_effect: "deny",
  });
  await page
    .getByLabel("override · users.change_password", { exact: true })
    .selectOption("allow");
  expect(
    (await calls(page, "admin_set_access_rule")).at(-1).args,
  ).toMatchObject({
    p_kind: "override",
    p_scope: "role",
    p_module_key: "users",
    p_action: "change_password",
    p_effect: "allow",
  });
  await page.locator("#master-scope").selectOption("user");
  await page.locator("#master-target").selectOption({ label: "Target Staff" });
  await page
    .getByLabel("override · users.change_password", { exact: true })
    .selectOption("deny");
  expect(
    (await calls(page, "admin_set_access_rule")).at(-1).args,
  ).toMatchObject({ p_scope: "user", p_effect: "deny" });
  await expect(
    page.getByRole("heading", { name: "Inventory", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Warehouse", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("permission · chat.send", { exact: true }),
  ).toBeVisible();
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

test("account creation and self-password changes use the existing authenticated services", async ({
  page,
}) => {
  await hosted(page, "super_admin");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Full name", { exact: true }).fill("New Staff");
  await page.getByLabel("Email", { exact: true }).fill("new@example.invalid");
  await page.getByLabel("Role", { exact: true }).selectOption("installer");
  await page.locator('[data-action="account-save"]').click();
  await expect(page.locator("#account-form")).toHaveCount(0);
  expect(await calls(page, "create-user")).toHaveLength(1);
  await page.locator('[data-page="profile"]').first().click();
  await page
    .getByRole("button", { name: "Change my password", exact: true })
    .click();
  await page
    .getByLabel("New password", { exact: true })
    .fill("disposable-self-password");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("disposable-self-password");
  await page.locator('[data-action="account-save"]').click();
  await expect(page.locator("#account-form")).toHaveCount(0);
  expect(await calls(page, "auth.updateUser")).toHaveLength(1);
  expect(await calls(page, "owner-change-password")).toHaveLength(0);
});

test("Login as user uses the target workspace and exits to original Master Control", async ({
  page,
}) => {
  await hosted(page, "super_admin");
  await staffRow(page)
    .getByRole("button", { name: "Login as user", exact: true })
    .click();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Disposable browser verification");
  await page.locator('[data-action="master-confirm"]').click();
  await expect(page.locator(".impersonation-bar")).toContainText(
    "Target Staff",
  );
  await expect(
    page.getByRole("button", { name: "Exit impersonation", exact: true }),
  ).toBeVisible();
  await expect(page.locator('.side-nav [data-page="master"]')).toHaveCount(0);
  await expect(page.locator('.side-nav [data-page="billing"]')).toHaveCount(0);
  await page
    .getByRole("button", { name: "Exit impersonation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Ultimate Control", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".impersonation-bar")).toHaveCount(0);
});

test("global read-only, tab visibility and locks use the same existing editor", async ({
  page,
}) => {
  await hosted(page, "super_admin");
  await page.locator('[data-page="master"]').first().click();
  await page
    .getByRole("button", { name: "Access controls", exact: true })
    .click();
  await page
    .getByLabel("module · inventory", { exact: true })
    .selectOption("readonly");
  expect(
    (await calls(page, "admin_set_module_access")).at(-1).args,
  ).toMatchObject({
    p_module_key: "inventory",
    p_scope: "global",
    p_state: "readonly",
  });
  await page
    .getByLabel("tab · inventory.view", { exact: true })
    .selectOption("deny");
  expect(
    (await calls(page, "admin_set_access_rule")).at(-1).args,
  ).toMatchObject({ p_kind: "tab", p_effect: "deny" });
  await page
    .getByRole("button", { name: "Ultimate Control", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Lock workspace", exact: true })
    .click();
  await page.locator('[data-action="master-confirm"]').click();
  await expect
    .poll(async () => (await calls(page, "admin_set_system_lock")).length)
    .toBe(1);
});

test("scoped create permissions are applied to controls independently of update", async ({
  page,
}) => {
  await hosted(page, "super_admin");
  await page.evaluate(() => {
    const modules = (window as any).accountFixture.context.modules;
    const leads = modules.find((m: any) => m.key === "leads");
    leads.can_create = true;
    leads.can_update = false;
    window.dispatchEvent(new Event("focus"));
  });
  await page.locator('.side-nav [data-page="leads"]').click();
  await expect(
    page.getByRole("button", { name: "New lead", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "New lead", exact: true }).click();
  await expect(page.locator('[data-action="create-lead"]')).toBeEnabled();
  await page.locator('[data-action="close-modal"]').first().click();
  await page.evaluate(() => {
    (window as any).accountFixture.context.modules.find(
      (m: any) => m.key === "leads",
    ).can_create = false;
    window.dispatchEvent(new Event("focus"));
  });
  await expect(
    page.getByRole("button", { name: "New lead", exact: true }),
  ).toBeDisabled();
});
