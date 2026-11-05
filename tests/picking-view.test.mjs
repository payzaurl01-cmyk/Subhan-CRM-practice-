import test from "node:test";
import assert from "node:assert/strict";
import { createWarehouse } from "../src/features/crm/views/warehouse.js";

test("normalized inventory keeps the original Picking & Scan console", () => {
  const job = {
    id: "job-1", number: "JOB-1", customer: "Customer",
    status: "Ready for Collection",
    items: [{ id: "item-1", name: "Curtains", sku: "SKU-1",
      barcode: "123", quantityRequired: 2, quantityMatched: 1 }],
  };
  const pick = { id: "pick-1", jobId: job.id, number: "PICK-1",
    status: "Awaiting collection", pickupConfirmedAt: "2026-11-04T00:00:00Z" };
  const ctx = {
    ui: { scanPickId: pick.id },
    inventoryControls: { pickupBalanceChoices: () => [] },
    renderProductRequests: () => "",
    visiblePickLists: () => [pick],
    jobOf: () => job,
    pickScanError: () => "",
    renderPickingState: () => "<section>Collection ready</section>",
    header: () => "<header>Pickup & collection</header>",
    sectionTitle: (title) => `<h3>${title}</h3>`,
    badge: (value) => `<span>${value}</span>`,
    icon: () => "",
    esc: (value) => String(value ?? ""),
    attr: (value) => String(value ?? ""),
  };
  const warehouse = createWarehouse(ctx);
  ctx.renderOriginalPicking = warehouse.renderOriginalPicking;
  const html = warehouse.renderPicking();
  assert.match(html, /Pick Lists/);
  assert.match(html, /Scan a required product/);
  assert.match(html, /id="barcode-input"/);
  assert.match(html, /id="scan-quantity"/);
  assert.match(html, /data-action="scan-barcode"/);
  assert.match(html, /data-action="toggle-camera"/);
  assert.doesNotMatch(html, /Approved inventory pickups/);
});
