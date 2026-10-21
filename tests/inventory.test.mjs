import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attributes,
  inventoryRows,
  findVariant,
  validateImage,
  EMPTY_INVENTORY,
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
    () => validateImage({ type: "image/png", size: 6 * 1024 * 1024 }),
    /5 MB/,
  );
});
test("adapter uses exact transactional commands and forwards actual backend failures", async () => {
  const calls = [];
  let fail = false;
  const b = createInventoryBackend({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return fail
        ? { error: { message: "Insufficient available stock" } }
        : { data: { movement_id: "id" } };
    },
  });
  await b.command("transfer", { variant_id: "v1", quantity: 2 }, "stable-key");
  await b.receivePO("po", [{ quantity: 2 }], "receipt-key");
  assert.deepEqual(calls, [
    {
      name: "inventory_command",
      args: {
        p_action: "transfer",
        p_payload: { variant_id: "v1", quantity: 2 },
        p_key: "stable-key",
      },
    },
    {
      name: "crm_receive_po",
      args: { p_po_id: "po", p_lines: [{ quantity: 2 }], p_key: "receipt-key" },
    },
  ]);
  fail = true;
  await assert.rejects(
    b.command("adjust", {}, "other"),
    /Insufficient available stock/,
  );
  assert.equal(calls.length, 3);
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
