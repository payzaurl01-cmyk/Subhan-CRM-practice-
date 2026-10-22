import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attributes,
  inventoryRows,
  findVariant,
  validateImage,
  EMPTY_INVENTORY,
  normalizeInventory,
  imageLinks,
  stockMoveArgs,
} from "../src/features/crm/inventory-model.js";
import { createInventoryBackend } from "../src/features/crm/inventory-backend.js";
import { createInventoryScanner } from "../src/features/crm/inventory-scanner.js";

const data = {
  ...EMPTY_INVENTORY,
  products: [{ id: "p1", name: "Blind", image_paths: ["product.png"] }],
  variants: [
    {
      id: "v1",
      product_id: "p1",
      name: "White 120cm",
      sku: "WHITE-120",
      attributes: { Colour: "White", Size: "120 cm" },
      image_paths: [],
    },
  ],
  images: [
    {
      id: "i1",
      product_id: "p1",
      variant_id: null,
      object_path: "product.png",
      active: true,
      is_primary: true,
      sort_order: 0,
    },
  ],
  barcodes: [{ variant_id: "v1", barcode: "0123456789012" }],
  balances: [
    {
      variant_id: "v1",
      warehouse_id: "w1",
      location_id: "l1",
      quantity_on_hand: 10,
      quantity_reserved: 2,
      reorder_level: 3,
    },
    {
      variant_id: "v1",
      warehouse_id: "w2",
      location_id: "l2",
      quantity_on_hand: 4,
      quantity_reserved: 3,
      reorder_level: 2,
    },
  ],
};
test("stock summary and filters respect distinct warehouse/location balances", () => {
  assert.deepEqual(
    inventoryRows(data).map((row) => [
      row.onHand,
      row.reserved,
      row.available,
      row.images,
    ]),
    [[14, 5, 9, ["product.png"]]],
  );
  assert.deepEqual(
    inventoryRows(data, { warehouse: "w2" }).map((row) => [
      row.onHand,
      row.reserved,
      row.available,
      row.status,
    ]),
    [[4, 3, 1, "low"]],
  );
  assert.equal(
    inventoryRows(data, { location: "l1", search: "0123456789012" })[0]
      .available,
    8,
  );
  assert.equal(inventoryRows(data, { warehouse: "missing" }).length, 0);
});
test("manual and handheld identifiers resolve exactly, never fuzzy-create unknown variants", () => {
  assert.equal(findVariant(data, " 0123456789012 ").id, "v1");
  assert.equal(findVariant(data, "white-120").id, "v1");
  assert.equal(findVariant(data, "WHITE"), null);
  assert.throws(
    () =>
      findVariant(
        {
          ...data,
          barcodes: [
            ...data.barcodes,
            { variant_id: "another", barcode: "WHITE-120" },
          ],
        },
        "WHITE-120",
      ),
    /Conflicting/,
  );
});
test("custom variant combinations and image validation reject invalid inputs", () => {
  assert.deepEqual(
    attributes("Colour: White\nSize: 120 cm;Material: Aluminium"),
    { Colour: "White", Size: "120 cm", Material: "Aluminium" },
  );
  assert.throws(() => attributes("Colour: White\ncolour: Black"), /unique/);
  assert.throws(() => attributes("Missing delimiter"), /Attribute/);
  validateImage({ type: "image/png", size: 1024 });
  assert.throws(
    () => validateImage({ type: "image/svg+xml", size: 1024 }),
    /JPEG/,
  );
  assert.throws(
    () => validateImage({ type: "image/png", size: 11 * 1024 * 1024 }),
    /10 MiB/,
  );
});
test("adapter maps all ten documented RPCs, accepts a movement UUID and preserves backend errors", async () => {
  const calls = [];
  let fail = false;
  const b = createInventoryBackend({
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (fail)
        return {
          error: { message: "Insufficient available stock", code: "P0001" },
        };
      if (name === "inventory_snapshot")
        return { data: { ...EMPTY_INVENTORY } };
      if (name === "warehouse_snapshot")
        return { data: { schema_version: 1, warehouses: [], locations: [] } };
      if (name === "inventory_lookup_barcode")
        return { data: { matches: [], count: 0 } };
      return {
        data: name === "inventory_move_stock" ? "movement-uuid" : { id: "id" },
      };
    },
  });
  assert.equal((await b.load()).summary.on_hand, 0);
  await b.warehouses();
  await b.saveProduct({ name: "Blind" });
  await b.saveVariant({ product_id: "p1" });
  await b.saveWarehouse({ name: "North" });
  await b.saveLocation({ warehouse_id: "w1" });
  await b.saveImage({ object_path: "actor/image.avif" });
  await b.saveBarcode("v1", " 123 ", true);
  assert.deepEqual(await b.lookup(" 123 "), []);
  const move = stockMoveArgs({
    eventId: "stable-key",
    variantId: "v1",
    quantity: 2,
    reason: "Transfer",
    source: { id: "l1", warehouse_id: "w1" },
    destination: { id: "l2", warehouse_id: "w2" },
  });
  assert.equal(await b.move(move), "movement-uuid");
  await b.receivePO("po", [{ quantity: 2 }], "receipt-key");
  assert.deepEqual(
    calls.map((c) => c.name),
    [
      "inventory_snapshot",
      "warehouse_snapshot",
      "inventory_save_product",
      "inventory_save_variant",
      "inventory_save_warehouse",
      "inventory_save_location",
      "inventory_save_image",
      "inventory_save_barcode",
      "inventory_lookup_barcode",
      "inventory_move_stock",
      "crm_receive_po",
    ],
  );
  assert.deepEqual(calls[2].args, { p_product: { name: "Blind" } });
  assert.deepEqual(calls[7].args, {
    p_variant_id: "v1",
    p_barcode: "123",
    p_is_primary: true,
  });
  assert.deepEqual(calls[8].args, { p_code: "123" });
  assert.deepEqual(calls[9].args, move);
  fail = true;
  await assert.rejects(
    b.move(move),
    (e) => e.message === "Insufficient available stock" && e.code === "P0001",
  );
});
test("snapshot decoding rejects SQL row arrays and missing contract fields", () => {
  assert.equal(normalizeInventory({ ...EMPTY_INVENTORY }).movements.length, 0);
  assert.throws(
    () => normalizeInventory([{ ...EMPTY_INVENTORY }]),
    /Unsupported/,
  );
  assert.throws(
    () => normalizeInventory({ ...EMPTY_INVENTORY, images: null }),
    /images/,
  );
  assert.throws(
    () => normalizeInventory({ ...EMPTY_INVENTORY, schema_version: 2 }),
    /Unsupported/,
  );
});
test("private image links prioritize primary and variant scope, and ignore archived links", () => {
  const images = [
    { id: "p", product_id: "p1", object_path: "product", sort_order: 0 },
    {
      id: "v",
      product_id: "p1",
      variant_id: "v1",
      object_path: "variant",
      sort_order: 4,
    },
    {
      id: "main",
      product_id: "p1",
      variant_id: "v1",
      object_path: "main",
      sort_order: 7,
      is_primary: true,
    },
    {
      id: "old",
      product_id: "p1",
      variant_id: "v1",
      object_path: "old",
      active: false,
      is_primary: true,
    },
  ];
  assert.deepEqual(
    imageLinks({ images }, "p1", "v1").map((i) => i.object_path),
    ["main", "variant"],
  );
  assert.deepEqual(
    imageLinks({ images }, "p1", "other").map((i) => i.object_path),
    ["product"],
  );
  validateImage({ type: "image/avif", size: 10 * 1024 * 1024 });
});
test("manual stock mapping distinguishes adds, deductions and immediate transfers", () => {
  const base = {
      eventId: "stable",
      variantId: "v",
      quantity: 1.5,
      reason: " Correction ",
    },
    loc = { id: "l", warehouse_id: "w" };
  const add = stockMoveArgs({ ...base, destination: loc });
  assert.equal(add.p_from_location_id, null);
  assert.equal(add.p_to_location_id, "l");
  assert.equal(add.p_reason, "Correction");
  const sub = stockMoveArgs({ ...base, source: loc });
  assert.equal(sub.p_to_location_id, null);
  assert.equal(sub.p_from_location_id, "l");
  for (const quantity of [0, -1, NaN, Infinity])
    assert.throws(
      () => stockMoveArgs({ ...base, quantity, destination: loc }),
      /Quantity/,
    );
  assert.throws(
    () => stockMoveArgs({ ...base, source: loc, destination: loc }),
    /different/,
  );
});
test("camera emits one preview, suppresses duplicate reads and stops media", async () => {
  let callback,
    stopped = 0,
    reads = 0,
    code = "";
  const video = { play: async () => {}, srcObject: null };
  const scanner = createInventoryScanner({
    media: {
      getUserMedia: async () => ({
        getTracks: () => [
          {
            stop() {
              stopped++;
            },
          },
        ],
      }),
    },
    Detector: class {
      async detect() {
        reads++;
        return [{ rawValue: "0123" }, { rawValue: "0123" }];
      }
    },
    frame: (fn) => {
      callback = fn;
      return 1;
    },
    cancel: () => {},
  });
  await scanner.start(video, (value) => (code = value), assert.fail);
  await callback();
  await callback();
  assert.equal(code, "0123");
  assert.equal(reads, 1);
  assert.equal(stopped, 1);
});
test("camera permission denial and unsupported browsers retain manual entry guidance", async () => {
  const denied = createInventoryScanner({
    Detector: class {},
    media: {
      getUserMedia: async () => {
        throw Object.assign(new Error("Denied"), { name: "NotAllowedError" });
      },
    },
    cancel: () => {},
  });
  await assert.rejects(
    denied.start(
      {},
      () => {},
      () => {},
    ),
    /permission denied.*manually/,
  );
  const unsupported = createInventoryScanner({ Detector: null, media: null });
  await assert.rejects(
    unsupported.start(
      {},
      () => {},
      () => {},
    ),
    /unsupported.*manually/,
  );
});
test("canceling an in-flight camera request stops the late stream", async () => {
  let resolve,
    stops = 0;
  const scanner = createInventoryScanner({
    Detector: class {},
    media: { getUserMedia: () => new Promise((r) => (resolve = r)) },
    cancel: () => {},
  });
  const started = scanner.start(
    { play: async () => {} },
    assert.fail,
    assert.fail,
  );
  scanner.stop();
  resolve({
    getTracks: () => [
      {
        stop() {
          stops++;
        },
      },
    ],
  });
  await started;
  assert.equal(stops, 1);
});
