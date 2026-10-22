import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

function state(): any {
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    products: [
      {
        id: "p1",
        name: "Roller blind",
        sku: "ROLLER",
        description: "Original description",
        unit: "each",
        product_type: "stock",
        cost_price: 10,
        sale_price: 20,
        tax_rate: 0,
        track_inventory: true,
        active: true,
        metadata: { preserved: "yes" },
      },
    ],
    variants: [
      {
        id: "v1",
        product_id: "p1",
        sku: "WHITE-120",
        name: "White 120 cm",
        attributes: { Colour: "White", Size: "120 cm" },
        cost_price: null,
        sale_price: null,
        active: true,
      },
    ],
    barcodes: [
      { variant_id: "v1", barcode: "0123456789012", is_primary: true },
    ],
    warehouses: [
      {
        id: "w1",
        name: "North warehouse",
        code: "NORTH",
        kind: "warehouse",
        address: {
          line1: "10 Main Street",
          city: "Sydney",
          postcode: "2000",
          country_code: "AU",
        },
        active: true,
      },
      {
        id: "w2",
        name: "South warehouse",
        code: "SOUTH",
        kind: "warehouse",
        address: null,
        active: true,
      },
    ],
    locations: [
      {
        id: "l1",
        warehouse_id: "w1",
        code: "DEFAULT",
        name: "Default storage",
        active: true,
      },
      {
        id: "l2",
        warehouse_id: "w2",
        code: "DEFAULT",
        name: "Default storage",
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
        quantity_damaged: 1,
        reorder_level: 3,
      },
      {
        id: "b2",
        variant_id: "v1",
        warehouse_id: "w2",
        location_id: "l2",
        quantity_on_hand: 4,
        quantity_reserved: 0,
        quantity_damaged: 0,
        reorder_level: 1,
      },
    ],
    images: [
      {
        id: "image1",
        product_id: "p1",
        variant_id: null,
        object_path: "actor/existing.png",
        alt_text: "Existing blind",
        is_primary: true,
        sort_order: 0,
        active: true,
      },
    ],
    recent_movements: [],
    summary: {},
  };
}
async function service(context: BrowserContext) {
  const server = {
    data: state(),
    calls: [] as any[],
    uploadError: "",
    imageError: "",
    barcodeError: "",
    deny: false,
    loseMoveReply: false,
    receipts: new Map<string, any>(),
    orders: [] as any[],
    items: [] as any[],
  };
  const summarize = () => {
    const d = server.data;
    for (const b of d.balances) {
      const v = d.variants.find((v: any) => v.id === b.variant_id),
        p = d.products.find((p: any) => p.id === v.product_id);
      b.quantity_available = b.quantity_on_hand - b.quantity_reserved;
      b.stock_value = b.quantity_on_hand * (v.cost_price ?? p.cost_price);
      b.low_stock =
        b.quantity_available < 3 || b.quantity_available <= b.reorder_level;
    }
    d.summary = {
      on_hand: d.balances.reduce(
        (n: number, b: any) => n + b.quantity_on_hand,
        0,
      ),
      reserved: d.balances.reduce(
        (n: number, b: any) => n + b.quantity_reserved,
        0,
      ),
      available: d.balances.reduce(
        (n: number, b: any) => n + b.quantity_available,
        0,
      ),
      stock_value: d.balances.reduce(
        (n: number, b: any) => n + b.stock_value,
        0,
      ),
      low_stock_variants: new Set(
        d.balances
          .filter((b: any) => b.low_stock)
          .map((b: any) => b.variant_id),
      ).size,
      product_count: d.products.length,
      warehouse_count: d.warehouses.length,
    };
  };
  await context.route("**/__inventory-fixture/api", async (route) => {
    const { name, args, role } = route.request().postDataJSON();
    server.calls.push({ name, args, role });
    let reply: any;
    if ((server.deny || role === "installer") && name.startsWith("inventory_"))
      reply = {
        error: { message: "Inventory permission revoked", code: "42501" },
      };
    else if (name === "inventory_snapshot") {
      summarize();
      reply = { data: server.data };
    } else if (name === "warehouse_snapshot")
      reply = {
        data: {
          schema_version: 1,
          warehouses: server.data.warehouses,
          locations: server.data.locations,
        },
      };
    else if (name === "history")
      reply = {
        data: server.data.recent_movements
          .filter((m: any) => m.variant_id === args.id)
          .slice(args.offset, args.offset + 100),
      };
    else if (name === "table")
      reply = {
        data:
          args.table === "purchase_orders"
            ? server.orders
            : args.table === "purchase_order_items"
              ? server.items
              : [],
      };
    else if (name === "signed-url")
      reply = {
        data: {
          signedUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        },
      };
    else if (name === "upload")
      reply = server.uploadError
        ? { error: { message: server.uploadError } }
        : { data: { path: args.path } };
    else if (name === "inventory_lookup_barcode") {
      const ids = new Set(
        server.data.barcodes
          .filter((b: any) => b.barcode === args.p_code)
          .map((b: any) => b.variant_id),
      );
      const matches = server.data.variants.filter(
        (v: any) => v.sku === args.p_code || ids.has(v.id),
      );
      reply = { data: { matches, count: matches.length } };
    } else if (name === "inventory_save_barcode") {
      if (server.barcodeError)
        reply = { error: { message: server.barcodeError } };
      else {
        let b = server.data.barcodes.find(
          (b: any) =>
            b.variant_id === args.p_variant_id && b.barcode === args.p_barcode,
        );
        if (!b) {
          b = {
            variant_id: args.p_variant_id,
            barcode: args.p_barcode,
            is_primary: args.p_is_primary,
          };
          server.data.barcodes.push(b);
        }
        reply = { data: b };
      }
    } else if (name === "inventory_move_stock") {
      const p = args,
        existing = server.receipts.get(p.p_event_id);
      if (existing) reply = { data: existing };
      else {
        const source = server.data.balances.find(
          (b: any) =>
            b.variant_id === p.p_variant_id &&
            b.location_id === p.p_from_location_id,
        );
        if (
          p.p_from_location_id &&
          (!source ||
            source.quantity_on_hand - source.quantity_reserved < p.p_quantity)
        )
          reply = {
            error: { message: "Insufficient available stock", code: "P0001" },
          };
        else {
          if (source) source.quantity_on_hand -= p.p_quantity;
          if (p.p_to_location_id) {
            let dest = server.data.balances.find(
              (b: any) =>
                b.variant_id === p.p_variant_id &&
                b.location_id === p.p_to_location_id,
            );
            if (!dest) {
              dest = {
                id: `b-${server.calls.length}`,
                variant_id: p.p_variant_id,
                location_id: p.p_to_location_id,
                warehouse_id: p.p_to_warehouse_id,
                quantity_on_hand: 0,
                quantity_reserved: 0,
                reorder_level: 0,
              };
              server.data.balances.push(dest);
            }
            dest.quantity_on_hand += p.p_quantity;
          }
          const id = `movement-${server.calls.length}`;
          server.receipts.set(p.p_event_id, id);
          server.data.recent_movements.unshift({
            id,
            variant_id: p.p_variant_id,
            quantity: p.p_quantity,
            notes: p.p_reason,
            movement_type:
              p.p_from_location_id && p.p_to_location_id
                ? "transfer"
                : "adjustment",
            from_location_id: p.p_from_location_id,
            to_location_id: p.p_to_location_id,
            created_at: new Date().toISOString(),
          });
          if (server.loseMoveReply) {
            server.loseMoveReply = false;
            await route.abort();
            return;
          }
          reply = { data: id };
        }
      }
    } else if (name.startsWith("inventory_save_")) {
      const kind: string = name.slice("inventory_save_".length),
        p = args[`p_${kind}`],
        table = {
          product: "products",
          variant: "variants",
          warehouse: "warehouses",
          location: "locations",
          image: "images",
        }[kind] as string;
      const allowed: Record<string, string[]> = {
        product: [
          "id",
          "category_id",
          "sku",
          "name",
          "description",
          "product_type",
          "unit",
          "cost_price",
          "sale_price",
          "tax_rate",
          "track_inventory",
          "active",
          "metadata",
        ],
        variant: [
          "id",
          "product_id",
          "sku",
          "name",
          "attributes",
          "cost_price",
          "sale_price",
          "active",
          "brand",
          "default_supplier_id",
          "default_location_id",
        ],
        warehouse: ["id", "name", "code", "active", "kind", "address"],
        location: ["id", "warehouse_id", "parent_id", "code", "name", "active"],
        image: [
          "id",
          "product_id",
          "variant_id",
          "object_path",
          "alt_text",
          "sort_order",
          "is_primary",
          "active",
        ],
      };
      if (Object.keys(p).some((key) => !allowed[kind].includes(key)))
        reply = { error: { message: "Unknown payload field" } };
      else if (kind === "image" && server.imageError)
        reply = { error: { message: server.imageError } };
      else {
        let row = server.data[table].find((r: any) => r.id === p.id);
        if (!row && p.id) reply = { error: { message: "Record not found" } };
        else {
          const created = !row;
          if (!row) {
            row = { id: `created-${server.calls.length}`, active: true, ...p };
            server.data[table].push(row);
          } else Object.assign(row, p);
          if (created && kind === "product")
            server.data.variants.push({
              id: `variant-${row.id}`,
              product_id: row.id,
              sku: row.sku,
              name: row.name,
              attributes: {},
              active: true,
              cost_price: null,
              sale_price: null,
            });
          if (created && kind === "warehouse")
            server.data.locations.push({
              id: `default-${row.id}`,
              warehouse_id: row.id,
              code: "DEFAULT",
              name: "Default location",
              active: true,
            });
          if (kind === "image" && row.is_primary)
            for (const other of server.data.images)
              if (
                other !== row &&
                other.product_id === row.product_id &&
                other.variant_id === row.variant_id
              )
                other.is_primary = false;
          reply = { data: row };
        }
      }
    } else if (name === "crm_receive_po") {
      server.receipts.set(args.p_key, { goods_receipt_id: "receipt" });
      reply = { data: { goods_receipt_id: "receipt" } };
    } else reply = { error: { message: `Unexpected function: ${name}` } };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(reply),
    });
  });
  return server;
}
async function mount(
  page: Page,
  role = "admin",
  overrides: Record<string, any> = {},
) {
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
  await page.evaluate(
    async ({ role, overrides }) => {
      const url = "/__inventory-fixture/fixture.js";
      await (await import(url)).mount(role, overrides);
    },
    { role, overrides },
  );
  await expect(page.locator(".app-shell")).toBeVisible();
}
const save = (page: Page) => page.locator('[data-action="inv-save"]').click();

test("summary uses the snapshot and handheld lookup is exact, trimmed and side effect free", async ({
  page,
  context,
}) => {
  const s = await service(context);
  await mount(page);
  await expect(page.locator(".metric").first()).toContainText("140");
  await page.getByLabel("Warehouse", { exact: true }).selectOption("w2");
  await expect(page.locator("article").last()).toContainText("On hand 4");
  await expect(page.locator(".metric").first()).toContainText("140");
  await page.locator("#inventory-code").fill(" 0123456789012 ");
  await page.locator("#inventory-code").press("Enter");
  await expect(page.locator("#inventory-scan").locator("..")).toContainText(
    "White 120 cm",
  );
  expect(
    s.calls.find((c) => c.name === "inventory_lookup_barcode").args,
  ).toEqual({ p_code: "0123456789012" });
  expect(
    s.calls.filter(
      (c) =>
        c.name.startsWith("inventory_save_") ||
        c.name === "inventory_move_stock",
    ),
  ).toHaveLength(0);
});

test("barcode collisions require an explicit choice and unknown codes prefill creation", async ({
  page,
  context,
}) => {
  const s = await service(context);
  s.data.variants.push({
    ...s.data.variants[0],
    id: "v2",
    sku: "0123456789012",
    name: "Other variant",
  });
  await mount(page);
  await page.locator("#inventory-code").fill("0123456789012");
  await page.locator("#inventory-code").press("Enter");
  await expect(
    page.getByText(
      "Multiple variants match this code. Choose the intended variant.",
    ),
  ).toBeVisible();
  await expect(page.locator('[data-action="inv-scan-choice"]')).toHaveCount(2);
  await page.locator('[data-action="inv-scan-choice"][data-id="v2"]').click();
  await expect(page.locator("#inventory-scan").locator("..")).toContainText(
    "Other variant",
  );
  await page.locator("#inventory-code").fill("UNKNOWN");
  await page.locator("#inventory-code").press("Enter");
  await page
    .getByRole("button", { name: "Create product with this barcode" })
    .click();
  await expect(page.getByLabel("Barcode (optional)")).toHaveValue("UNKNOWN");
});

test("create, reload, edit product and variant overrides use strict payloads without stock writes", async ({
  page,
  context,
}) => {
  const s = await service(context);
  await mount(page);
  await page
    .getByRole("button", { name: "Create product", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("New blind");
  await page.getByLabel("SKU", { exact: true }).fill("NEW");
  await page.getByLabel("Cost price", { exact: true }).fill("40");
  await save(page);
  await expect(page.locator("#inventory-form")).toHaveCount(0);
  expect(s.data.products).toHaveLength(2);
  expect(s.data.variants).toHaveLength(2);
  expect(s.data.balances).toHaveLength(2);
  const id = s.data.variants.find((v: any) => v.sku === "NEW").id;
  await page.locator(`[data-action="inv-detail"][data-id="${id}"]`).click();
  await page.getByRole("button", { name: "Add variation" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Black 120");
  await page.getByLabel("SKU", { exact: true }).fill("BLACK-120");
  await page
    .getByLabel("Variations / custom attributes")
    .fill("Colour: Black\nSize: 120 cm");
  await save(page);
  await expect(page.locator("#inventory-form")).toHaveCount(0);
  expect(s.data.variants.at(-1).attributes).toEqual({
    Colour: "Black",
    Size: "120 cm",
  });
  expect(s.data.variants.at(-1).cost_price).toBeNull();
  await page.locator('[data-action="inv-detail"][data-id="v1"]').click();
  await page.getByRole("button", { name: "Edit product", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Changed catalogue");
  await page.getByLabel("Cost price", { exact: true }).fill("50");
  await save(page);
  await expect(page.locator("#inventory-form")).toHaveCount(0);
  expect(s.data.variants[0].name).toBe("White 120 cm");
  expect(s.data.products[0].metadata).toEqual({ preserved: "yes" });
  expect(s.calls.filter((c) => c.name === "inventory_move_stock")).toHaveLength(
    0,
  );
  await mount(page);
  await expect(page.locator(".content")).toContainText("Changed catalogue");
});

test("barcode failure after product save retries its UUID without duplicating the product", async ({
  page,
  context,
}) => {
  const s = await service(context);
  s.barcodeError = "Barcode service unavailable";
  await mount(page);
  await page
    .getByRole("button", { name: "Create product", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Retry blind");
  await page.getByLabel("SKU", { exact: true }).fill("RETRY");
  await page.getByLabel("Barcode (optional)").fill("RETRY-CODE");
  await save(page);
  await expect(page.getByRole("alert").last()).toContainText(
    "Catalogue record saved",
  );
  expect(s.data.products).toHaveLength(2);
  s.barcodeError = "";
  await save(page);
  await expect(page.locator("#inventory-form")).toHaveCount(0);
  expect(s.data.products).toHaveLength(2);
  const calls = s.calls.filter((c) => c.name === "inventory_save_product");
  expect(calls[1].args.p_product.id).toBe(s.data.products[1].id);
});

test("transfer posts once across duplicate clicks and is visible to a second device", async ({
  page,
  context,
}) => {
  const s = await service(context);
  await mount(page);
  await page.getByRole("button", { name: "Transfer", exact: true }).click();
  await page
    .getByLabel("Warehouse / storage location", { exact: true })
    .selectOption("l1");
  await page.getByLabel("Destination warehouse / location").selectOption("l2");
  await page.getByLabel("Quantity", { exact: true }).fill("3");
  await page.getByLabel("Reason", { exact: true }).fill("Rebalance");
  await page.locator('[data-action="inv-save"]').evaluate((b: any) => {
    b.click();
    b.click();
  });
  await expect(page.locator("#inventory-form")).toHaveCount(0);
  expect(s.calls.filter((c) => c.name === "inventory_move_stock")).toHaveLength(
    1,
  );
  expect(s.data.balances.map((b: any) => b.quantity_on_hand)).toEqual([7, 7]);
  const other = await context.newPage();
  await mount(other);
  await other.getByLabel("Warehouse", { exact: true }).selectOption("w2");
  await expect(other.locator("article").last()).toContainText("On hand 7");
  await other.close();
});

test("lost movement responses retain the same operation UUID across remount and never double post", async ({
  page,
  context,
}) => {
  const s = await service(context);
  s.loseMoveReply = true;
  await mount(page);
  await page.getByRole("button", { name: "Add Stock", exact: true }).click();
  await page
    .getByLabel("Warehouse / storage location", { exact: true })
    .selectOption("l1");
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.getByLabel("Reason", { exact: true }).fill("Opening stock");
  await save(page);
  await expect(page.getByRole("alert").last()).toBeVisible();
  expect(s.data.balances[0].quantity_on_hand).toBe(12);
  await mount(page);
  await page
    .getByRole("button", { name: "Retry unconfirmed operation" })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry unconfirmed operation" }),
  ).toHaveCount(0);
  const calls = s.calls.filter((c) => c.name === "inventory_move_stock");
  expect(calls).toHaveLength(2);
  expect(calls[0].args).toEqual(calls[1].args);
  expect(s.data.balances[0].quantity_on_hand).toBe(12);
});

test("warehouse address is nested, default location persists, and location payload has no legacy level", async ({
  page,
  context,
}) => {
  const s = await service(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page);
  await page.getByRole("button", { name: "Warehouses", exact: true }).click();
  await expect(page.locator(".content")).toContainText(
    "10 Main Street, Sydney, 2000, AU",
  );
  await page
    .getByRole("button", { name: "Create warehouse", exact: true })
    .click();
  await page.getByLabel("Warehouse name").fill("East warehouse");
  await page.getByLabel("Unique code").fill("EAST");
  await page.getByLabel("Address line 1", { exact: true }).fill("20 East Road");
  await page.getByLabel("Postcode").fill("2001");
  await save(page);
  await expect(page.locator("#inventory-form")).toHaveCount(0);
  const w = s.data.warehouses.at(-1);
  expect(w.address).toMatchObject({
    line1: "20 East Road",
    postcode: "2001",
    country_code: "AU",
  });
  expect(s.data.locations.at(-1).code).toBe("DEFAULT");
  await page
    .getByRole("button", { name: "Create storage location", exact: true })
    .click();
  await page.getByLabel("Warehouse", { exact: true }).selectOption(w.id);
  await page.getByLabel("Location code").fill("SHELF-A");
  await page.getByLabel("Location name").fill("Shelf A");
  await page
    .getByLabel("Parent location (optional)")
    .selectOption(`default-${w.id}`);
  await save(page);
  await expect(page.locator("#inventory-form")).toHaveCount(0);
  expect(s.data.locations.at(-1).parent_id).toBe(`default-${w.id}`);
  expect(
    s.calls.find((c) => c.name === "inventory_save_location").args.p_location,
  ).not.toHaveProperty("level");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("image upload and link failures preserve the old gallery and retry without uploading twice", async ({
  page,
  context,
}) => {
  const s = await service(context);
  await mount(page);
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await page
    .getByRole("button", { name: "Product images", exact: true })
    .click();
  s.uploadError = "Upload denied";
  await page.locator("#inventory-images").setInputFiles({
    name: "blind.avif",
    mimeType: "image/avif",
    buffer: Buffer.from("test-image"),
  });
  await page.getByLabel("Image description").fill("Replacement blind");
  await save(page);
  await expect(page.getByRole("alert").last()).toContainText("Upload denied");
  expect(s.data.images).toHaveLength(1);
  s.uploadError = "";
  s.imageError = "Link rejected";
  await page.locator("#inventory-images").setInputFiles({
    name: "blind.avif",
    mimeType: "image/avif",
    buffer: Buffer.from("test-image"),
  });
  await save(page);
  await expect(page.getByRole("alert").last()).toContainText("Link rejected");
  const count = s.calls.filter((c) => c.name === "upload").length;
  s.imageError = "";
  await save(page);
  await expect(page.locator("#inventory-form")).toHaveCount(0);
  expect(s.calls.filter((c) => c.name === "upload")).toHaveLength(count);
  expect(s.data.images).toHaveLength(2);
  expect(s.calls.filter((c) => c.name === "inventory_move_stock")).toHaveLength(
    0,
  );
});

test("empty inventory renders zero summary and no seeded inventory", async ({
  page,
  context,
}) => {
  const s = await service(context);
  for (const key of [
    "products",
    "variants",
    "barcodes",
    "warehouses",
    "locations",
    "balances",
    "images",
    "recent_movements",
  ])
    s.data[key] = [];
  await mount(page);
  await expect(page.locator(".content")).toContainText(
    "No variants match these filters",
  );
  await expect(page.locator(".metric").first()).toContainText("0");
  expect(
    s.calls.filter((c) => c.name.startsWith("inventory_save")),
  ).toHaveLength(0);
});

test("installers are denied by the deployed API and stale grants surface denial", async ({
  page,
  context,
}) => {
  const s = await service(context);
  await mount(page, "installer");
  await expect(
    page.getByRole("button", { name: "Create product", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("permission revoked");
  await mount(page);
  await page.getByRole("button", { name: "Edit variant", exact: true }).click();
  s.deny = true;
  await save(page);
  await expect(page.getByRole("alert").last()).toContainText(
    "permission revoked",
  );
  expect(s.data.variants[0].name).toBe("White 120 cm");
});

test("focus and reconnect refetch snapshots without a Realtime publication", async ({
  page,
  context,
}) => {
  const s = await service(context);
  await mount(page);
  s.data.balances[0].quantity_on_hand = 20;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator("article").last()).toContainText("On hand 24");
  s.data.balances[0].quantity_on_hand = 30;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("article").last()).toContainText("On hand 34");
});

test("camera duplicate frames only perform an exact lookup and leave stock untouched", async ({
  page,
  context,
}) => {
  const s = await service(context);
  await page.addInitScript(() => {
    (window as any).BarcodeDetector = class {
      async detect() {
        return [{ rawValue: "0123456789012" }, { rawValue: "0123456789012" }];
      }
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
      configurable: true,
      set() {},
      get() {
        return null;
      },
    });
    HTMLMediaElement.prototype.play = async () => {};
  });
  await mount(page);
  await page.getByRole("button", { name: "Use camera", exact: true }).click();
  await expect(page.locator("#inventory-code")).toHaveValue("0123456789012");
  await expect
    .poll(
      () => s.calls.filter((c) => c.name === "inventory_lookup_barcode").length,
    )
    .toBe(1);
  expect(s.calls.filter((c) => c.name === "inventory_move_stock")).toHaveLength(
    0,
  );
});

test("signed private images expire after five minutes and refresh while the screen stays open", async ({
  page,
  context,
}) => {
  const s = await service(context);
  await page.clock.install();
  await mount(page);
  await expect
    .poll(() => s.calls.filter((c) => c.name === "signed-url").length)
    .toBeGreaterThan(0);
  const before = s.calls.filter((c) => c.name === "signed-url").length;
  expect(s.calls.find((c) => c.name === "signed-url").args.expiresIn).toBe(300);
  await page.clock.fastForward(245000);
  await expect
    .poll(() => s.calls.filter((c) => c.name === "signed-url").length)
    .toBeGreaterThan(before);
  await expect(page.locator("[data-inventory-image]").first()).toHaveJSProperty(
    "complete",
    true,
  );
});

test("create requires view, update and create grants, and archive can be restored", async ({
  page,
  context,
}) => {
  const s = await service(context);
  await mount(page);
  await page.getByRole("button", { name: "Edit variant", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("false");
  await save(page);
  await expect(page.locator("#inventory-form")).toHaveCount(0);
  await expect(page.locator(".content")).toContainText(
    "No variants match these filters",
  );
  await page.getByLabel("Catalogue status").selectOption("archived");
  await page.getByRole("button", { name: "Edit variant", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("true");
  await save(page);
  await expect(page.locator("#inventory-form")).toHaveCount(0);
  expect(s.data.variants[0].active).toBe(true);
  await page.evaluate(() => {
    (window as any).inventoryFixture.context.modules.find(
      (m: any) => m.key === "inventory",
    ).can_update = false;
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Create product", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add Stock", exact: true }),
  ).toHaveCount(0);
});

test("PO receipt uses its existing RPC and never also posts a manual movement", async ({
  page,
  context,
}) => {
  const s = await service(context);
  s.orders = [
    { id: "po1", po_number: 1001, warehouse_id: "w1", status: "ordered" },
  ];
  s.items = [
    {
      id: "line1",
      purchase_order_id: "po1",
      variant_id: "v1",
      quantity_ordered: 5,
      quantity_received: 2,
    },
  ];
  await mount(page);
  await page.getByRole("button", { name: "Receipts", exact: true }).click();
  await page
    .getByRole("button", { name: "Receive remaining quantities" })
    .click();
  await page.getByLabel("Receiving location").selectOption("l1");
  await save(page);
  await expect(page.locator("#inventory-form")).toHaveCount(0);
  const call = s.calls.find((c) => c.name === "crm_receive_po");
  expect(call.args.p_po_id).toBe("po1");
  expect(call.args.p_lines).toEqual([
    { purchase_order_item_id: "line1", quantity: 3, location_id: "l1" },
  ]);
  expect(s.calls.filter((c) => c.name === "inventory_move_stock")).toHaveLength(
    0,
  );
});

test("warehouse-only management users load the warehouse snapshot without inventory permission", async ({
  page,
  context,
}) => {
  const s = await service(context);
  await mount(page, "manager", {
    inventory: { can_view: false, can_update: false, can_create: false },
  });
  await page.locator('[data-page="picking"]').first().click();
  await expect(
    page.getByRole("heading", { name: "Warehouses and locations" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create warehouse", exact: true }),
  ).toBeVisible();
  expect(s.calls.filter((c) => c.name === "inventory_snapshot")).toHaveLength(
    0,
  );
  expect(s.calls.some((c) => c.name === "warehouse_snapshot")).toBe(true);
});

test("warehouse edits preserve omitted addresses and inactive location parents", async ({
  page,
  context,
}) => {
  const s = await service(context);
  s.data.locations.push({
    id: "old-parent",
    warehouse_id: "w1",
    code: "OLD",
    name: "Archived zone",
    active: false,
  });
  s.data.locations[0].parent_id = "old-parent";
  await mount(page);
  await page.getByRole("button", { name: "Warehouses", exact: true }).click();
  await page
    .locator('[data-action="inv-warehouse-edit"][data-id="w1"]')
    .click();
  await page.getByLabel("Warehouse name").fill("Renamed warehouse");
  await save(page);
  await expect(page.locator("#inventory-form")).toHaveCount(0);
  expect(
    s.calls.find((c) => c.name === "inventory_save_warehouse").args.p_warehouse,
  ).not.toHaveProperty("address");
  expect(s.data.warehouses[0].address.line1).toBe("10 Main Street");
  await page.locator('[data-action="inv-location-edit"][data-id="l1"]').click();
  await expect(page.getByLabel("Parent location (optional)")).toHaveValue(
    "old-parent",
  );
  await page.getByLabel("Location name").fill("Updated bin");
  await save(page);
  await expect(page.locator("#inventory-form")).toHaveCount(0);
  expect(s.data.locations[0].parent_id).toBe("old-parent");
});
