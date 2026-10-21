import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

function state() {
  return {
    products: [
      {
        id: "p1",
        name: "Roller blind",
        sku: "ROLLER",
        unit: "each",
        description: "Original description",
        cost_price: 10,
        sale_price: 20,
        active: true,
        image_paths: ["existing.png"],
        metadata: {},
      },
    ],
    variants: [
      {
        id: "v1",
        product_id: "p1",
        name: "White 120 cm",
        sku: "WHITE-120",
        attributes: { Colour: "White", Size: "120 cm" },
        active: true,
        cost_price: 10,
        sale_price: 20,
        image_paths: [],
      },
    ],
    warehouses: [
      { id: "w1", name: "North warehouse", code: "NORTH", active: true },
      { id: "w2", name: "South warehouse", code: "SOUTH", active: true },
    ],
    locations: [
      {
        id: "l1",
        warehouse_id: "w1",
        code: "DEFAULT",
        name: "Default storage",
        level: "bin",
        active: true,
      },
      {
        id: "l2",
        warehouse_id: "w2",
        code: "DEFAULT",
        name: "Default storage",
        level: "bin",
        active: true,
      },
    ],
    balances: [
      {
        id: "b1",
        variant_id: "v1",
        warehouse_id: "w1",
        location_id: "l1",
        quantity_on_hand: 10,
        quantity_reserved: 2,
        reorder_level: 3,
      },
      {
        id: "b2",
        variant_id: "v1",
        warehouse_id: "w2",
        location_id: "l2",
        quantity_on_hand: 4,
        quantity_reserved: 0,
        reorder_level: 1,
      },
    ],
    barcodes: [
      { variant_id: "v1", barcode: "0123456789012", is_primary: true },
    ],
    movements: [],
    categories: [],
    suppliers: [],
    job_items: [],
    return_items: [],
    purchase_orders: [],
    purchase_items: [],
    review: [
      {
        id: "legacy-job",
        collection: "jobs",
        reason: "Explicit mapping required",
      },
    ],
    unassigned_balances: [],
  } as any;
}
async function service(context: BrowserContext) {
  const server = {
    data: state(),
    calls: [] as any[],
    uploadError: "",
    deny: false,
    receipts: new Map<string, any>(),
  };
  await context.route("**/__inventory-fixture/api", async (route) => {
    const { name, args, role } = route.request().postDataJSON();
    server.calls.push({ name, args, role });
    let reply: any = { data: {} };
    if (name === "inventory_snapshot") reply = { data: server.data };
    else if (name === "history")
      reply = {
        data: server.data.movements
          .filter((m: any) => m.variant_id === args.id)
          .slice(args.offset, args.offset + 100),
      };
    else if (name === "upload")
      reply = server.uploadError
        ? { error: { message: server.uploadError } }
        : { data: { path: args.path } };
    else if (name === "inventory_command") {
      const action = args.p_action,
        p = args.p_payload,
        key = args.p_key;
      if (server.deny || (role === "installer" && action !== "issue"))
        reply = { error: { message: "Inventory permission revoked" } };
      else if (server.receipts.has(key))
        reply = { data: server.receipts.get(key) };
      else {
        const id = p.id || `created-${server.calls.length}`;
        let result: any = { id };
        if (action === "allocate_job") {
          const line = server.data.legacy_job_items.find(
            (i: any) => i.job_id === p.job_id && i.item_id === p.item_id,
          );
          server.data.allocations.push({
            ...p,
            id,
            quantity_reserved: p.quantity,
            quantity_issued: 0,
            job_snapshot: { name: line.name },
          });
          server.data.balances.find(
            (b: any) =>
              b.variant_id === p.variant_id && b.location_id === p.location_id,
          ).quantity_reserved += p.quantity;
          server.data.legacy_job_items = server.data.legacy_job_items.filter(
            (i: any) => i !== line,
          );
        }
        if (action === "allocation_issue") {
          const allocation = server.data.allocations.find(
            (a: any) => a.id === p.allocation_id,
          );
          const b = server.data.balances.find(
            (b: any) =>
              b.variant_id === allocation.variant_id &&
              b.location_id === allocation.location_id,
          );
          const q = Number(p.quantity);
          b.quantity_on_hand -= q;
          b.quantity_reserved -= q;
          allocation.quantity_reserved -= q;
          allocation.quantity_issued += q;
        }
        if (action === "warehouse") {
          const row = { ...p, id };
          server.data.warehouses.push(row);
          server.data.locations.push({
            id: `default-${id}`,
            warehouse_id: id,
            name: "Default storage",
            code: "DEFAULT",
            level: "bin",
            active: true,
          });
        }
        if (action === "product") {
          const row = {
            ...p,
            id,
            metadata: { brand: p.brand, supplier_id: p.supplier_id },
          };
          const old = server.data.products.findIndex(
            (item: any) => item.id === id,
          );
          if (old >= 0) server.data.products[old] = row;
          else {
            server.data.products.push(row);
            server.data.variants.push({
              id: `variant-${id}`,
              product_id: id,
              name: p.name,
              sku: p.sku,
              active: true,
              attributes: p.attributes || {},
              image_paths: [],
            });
            if (p.barcode)
              server.data.barcodes.push({
                variant_id: `variant-${id}`,
                barcode: p.barcode,
                is_primary: true,
              });
          }
        }
        if (action === "variant") {
          server.data.variants.push({ ...p, id, active: true });
          if (p.barcode)
            server.data.barcodes.push({
              variant_id: id,
              barcode: p.barcode,
              is_primary: true,
            });
        }
        if (["receive", "adjust", "transfer"].includes(action)) {
          const b = server.data.balances.find(
            (b: any) =>
              b.variant_id === p.variant_id && b.location_id === p.location_id,
          );
          const q = Number(p.quantity);
          if (
            (q < 0 && -q > b.quantity_on_hand - b.quantity_reserved) ||
            (action === "transfer" &&
              q > b.quantity_on_hand - b.quantity_reserved)
          )
            reply = { error: { message: "Insufficient available stock" } };
          else {
            b.quantity_on_hand += action === "transfer" ? -q : q;
            if (action === "transfer")
              server.data.balances.find(
                (b: any) =>
                  b.variant_id === p.variant_id &&
                  b.location_id === p.destination_id,
              ).quantity_on_hand += q;
            server.data.movements.push({
              id,
              key,
              variant_id: p.variant_id,
              quantity: q,
              movement_type: action,
              notes: p.reason,
              reference_text: p.reference,
              created_by: "actor",
              created_at: new Date().toISOString(),
              variant_snapshot: { sku: "WHITE-120" },
            });
          }
        }
        if (!reply.error) {
          server.receipts.set(key, result);
          reply = { data: result };
        }
      }
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(reply),
    });
  });
  return server;
}
async function mount(page: Page, role = "admin") {
  let styles: string[] = [];
  await page.route("**/__inventory-fixture/**", async (route) => {
    const name = new URL(route.request().url()).pathname.slice(
      "/__inventory-fixture/".length,
    );
    if (name === "api") {
      await route.fallback();
      return;
    }
    if (name === "host.html") {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head>${styles.map((href) => `<link rel="stylesheet" href="${href}">`).join("")}</head><body></body></html>`,
      });
      return;
    }
    const file =
      name === "fixture.js"
        ? path.resolve("tests/fixtures/hosted-inventory.js")
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
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    );
  await page.goto("/__inventory-fixture/host.html");
  await page.evaluate(async (role) => {
    const url = "/__inventory-fixture/fixture.js";
    await (await import(url)).mount(role);
  }, role);
  await expect(page.locator(".app-shell")).toBeVisible();
}
const save = (page: Page) => page.locator('[data-action="inv-save"]').click();

test("warehouse filters, exact handheld lookup and unknown barcode flows", async ({
  page,
  context,
}) => {
  const server = await service(context);
  await mount(page);
  await page.getByLabel("Warehouse", { exact: true }).selectOption("w2");
  await expect(page.locator(".metric").first().locator(".value")).toContainText(
    "4",
  );
  await page.locator("#inventory-code").fill("0123456789012");
  await page.locator("#inventory-code").press("Enter");
  await expect(page.locator(".content")).toContainText(
    "Colour: White · Size: 120 cm",
  );
  expect(
    server.calls.filter((c) => c.name === "inventory_command"),
  ).toHaveLength(0);
  await page.locator("#inventory-code").fill("UNKNOWN-777");
  await page.locator("#inventory-code").press("Enter");
  await expect(page.locator(".content")).toContainText(
    "No product or stock was created",
  );
  await page
    .getByRole("button", { name: "Create product with this barcode" })
    .click();
  await expect(
    page.getByLabel("Barcode (optional)", { exact: true }),
  ).toHaveValue("UNKNOWN-777");
  expect(server.data.products).toHaveLength(1);
});

test("product creation, custom variations and catalogue edits do not overwrite stock", async ({
  page,
  context,
}) => {
  const server = await service(context);
  await mount(page);
  await page
    .getByRole("button", { name: "Create product", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Screen blind");
  await page.getByLabel("SKU", { exact: true }).fill("SCREEN-01");
  await page
    .getByLabel("Variations / custom attributes")
    .fill("Colour: White\nWidth: 120 cm\nFinish: Matte");
  await save(page);
  await expect(page.locator("#inventory-form")).toHaveCount(0);
  expect(server.data.products).toHaveLength(2);
  expect(server.data.variants[1].attributes).toEqual({
    Colour: "White",
    Width: "120 cm",
    Finish: "Matte",
  });
  await page.locator('[data-action="inv-detail"][data-id="v1"]').click();
  await page.getByRole("button", { name: "Edit product", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Updated roller");
  await save(page);
  expect(server.data.balances[0].quantity_on_hand).toBe(10);
  const edited = server.calls
    .filter(
      (c) => c.name === "inventory_command" && c.args.p_action === "product",
    )
    .at(-1).args.p_payload;
  expect(edited).not.toHaveProperty("opening_quantity");
  expect(edited).not.toHaveProperty("quantity_on_hand");
});

test("confirmed transfer persists for a second authorized device and double submissions post once", async ({
  page,
  context,
}) => {
  const server = await service(context);
  await mount(page);
  await page.locator('[data-action="inv-transfer"]').click();
  await page
    .getByLabel("Warehouse / storage location", { exact: true })
    .selectOption("l1");
  await page.getByLabel("Destination warehouse / location").selectOption("l2");
  await page.getByLabel("Quantity", { exact: true }).fill("3");
  await page.getByLabel("Reason", { exact: true }).fill("Rebalance");
  await page.getByLabel("Reference", { exact: true }).fill("TRANSFER-01");
  await page
    .locator('[data-action="inv-save"]')
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.locator("#inventory-form")).toHaveCount(0);
  expect(
    server.calls.filter((c) => c.name === "inventory_command"),
  ).toHaveLength(1);
  expect(server.data.balances.map((b: any) => b.quantity_on_hand)).toEqual([
    7, 7,
  ]);
  const other = await context.newPage();
  await mount(other);
  await other.getByLabel("Warehouse", { exact: true }).selectOption("w2");
  await expect(
    other.locator(".metric").first().locator(".value"),
  ).toContainText("7");
  await other.close();
});

test("failed image replacement retains existing references and exposes upload error", async ({
  page,
  context,
}) => {
  const server = await service(context);
  server.uploadError = "Storage upload permission denied";
  await mount(page);
  await page.locator('[data-action="inv-detail"]').click();
  await page.getByRole("button", { name: "Edit product", exact: true }).click();
  await page.locator('[name="replace_images"]').check();
  await page.locator("#inventory-images").setInputFiles({
    name: "new.png",
    mimeType: "image/png",
    buffer: Buffer.from("89504e470d0a1a0a", "hex"),
  });
  await save(page);
  await expect(page.locator("#overlay")).toContainText(
    "Storage upload permission denied",
  );
  expect(server.data.products[0].image_paths).toEqual(["existing.png"]);
  expect(
    server.calls.filter((c) => c.name === "inventory_command"),
  ).toHaveLength(0);
});

test("installer cannot edit stock, and stale management grants surface backend denial", async ({
  page,
  context,
}) => {
  const server = await service(context);
  await mount(page, "installer");
  await expect(
    page.getByRole("button", { name: "Create product", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Adjust Stock", exact: true }),
  ).toHaveCount(0);
  await mount(page, "manager");
  server.deny = true;
  await page.locator('[data-action="inv-adjust"]').click();
  await page
    .getByLabel("Warehouse / storage location", { exact: true })
    .selectOption("l1");
  await page.getByLabel("Signed quantity (+ / −)").fill("-1");
  await page.getByLabel("Reason", { exact: true }).fill("Count");
  await page.getByLabel("Reference", { exact: true }).fill("COUNT-1");
  await save(page);
  await expect(page.locator("#overlay")).toContainText(
    "Inventory permission revoked",
  );
  expect(server.data.balances[0].quantity_on_hand).toBe(10);
});

test("camera duplicate frames only preview a variant", async ({
  page,
  context,
}) => {
  const server = await service(context);
  await page.addInitScript(() => {
    (window as any).BarcodeDetector = class {
      async detect() {
        return [{ rawValue: "0123456789012" }, { rawValue: "0123456789012" }];
      }
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => new MediaStream() },
    });
    HTMLMediaElement.prototype.play = async () => {};
  });
  await mount(page);
  await page.getByRole("button", { name: "Use camera", exact: true }).click();
  await expect(page.locator("#inventory-code")).toHaveValue("0123456789012");
  expect(
    server.calls.filter((c) => c.name === "inventory_command"),
  ).toHaveLength(0);
});

test("warehouse creation includes a default location and mobile actions fit", async ({
  page,
  context,
}) => {
  const server = await service(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page);
  await page.getByRole("button", { name: "Warehouses", exact: true }).click();
  await page
    .getByRole("button", { name: "Create warehouse", exact: true })
    .click();
  await page.getByLabel("Warehouse name").fill("West warehouse");
  await page.getByLabel("Unique code").fill("WEST");
  await page.getByLabel("Address", { exact: true }).fill("1 West Road");
  await page.getByLabel("Postcode").fill("4000");
  await save(page);
  await expect(page.locator(".content")).toContainText("West warehouse");
  expect(server.data.locations).toHaveLength(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("existing CRM job items can be explicitly allocated and scanned before issue", async ({
  page,
  context,
}) => {
  const server = await service(context);
  server.data.allocations = [];
  server.data.collectors = [{ id: "actor", name: "Assigned collector" }];
  server.data.legacy_job_items = [
    {
      id: "old-job/old-item",
      job_id: "old-job",
      item_id: "old-item",
      job_number: "JOB-OLD",
      name: "Quoted blind snapshot",
      sku: "OLD-SKU",
      quantity: 2,
    },
  ];
  await mount(page);
  await page.getByRole("button", { name: "Jobs", exact: true }).click();
  await page.getByRole("button", { name: "Approve a job allocation" }).click();
  await page
    .getByLabel("Job item requiring allocation")
    .selectOption("old-job/old-item");
  await page.getByLabel("Confirmed product variant").selectOption("v1");
  await page
    .getByLabel("Warehouse / storage location", { exact: true })
    .selectOption("l1");
  await page.getByLabel("Authorized collector").selectOption("actor");
  await page.locator('[name="mapping_confirmed"]').check();
  await save(page);
  await expect(page.locator("#inventory-form")).toHaveCount(0);
  expect(server.data.balances[0].quantity_reserved).toBe(4);
  await page.getByRole("button", { name: "Scan and issue" }).click();
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.getByLabel("Reason", { exact: true }).fill("Verified collection");
  await page.getByLabel("Reference", { exact: true }).fill("JOB-OLD");
  await page
    .getByLabel("Scan or enter the exact SKU / barcode")
    .fill("0123456789012");
  await page.getByLabel("Scan or enter the exact SKU / barcode").press("Enter");
  await expect(page.locator("#inventory-form")).toHaveCount(0);
  expect(server.data.balances[0].quantity_on_hand).toBe(8);
  expect(server.data.balances[0].quantity_reserved).toBe(2);
  const issued = server.calls.find(
    (c) =>
      c.name === "inventory_command" && c.args.p_action === "allocation_issue",
  );
  expect(issued.args.p_payload.quantity).toBe("2");
  expect(issued.args.p_payload).not.toHaveProperty("code");
});
