import {
  EMPTY_INVENTORY,
  attributes,
  findVariant,
  inventoryRows,
  variationLabel,
} from "./inventory-model.js";
import { createInventoryScanner } from "./inventory-scanner.js";

export function createInventoryControls({
  backend,
  ctx,
  lifecycle,
  access,
  render,
  initial,
  onData,
}) {
  let data = initial?.data ? { ...EMPTY_INVENTORY, ...initial.data } : null,
    error = initial?.error || "",
    notice = "",
    busy = false,
    pending = null,
    modal = null;
  let tab = "stock",
    scanCode = "",
    scanVariant = null,
    unknown = false;
  const filters = {
    search: "",
    warehouse: "",
    location: "",
    category: "",
    variant: "",
    stock: "",
  };
  const urls = new Map();
  const scanner = createInventoryScanner();
  const e = ctx.esc;
  const permission = (module, action) =>
    access()?.modules?.find((item) => item.key === module)?.[
      `can_${action}`
    ] === true;
  const manager = () =>
    ["super_admin", "admin", "manager"].includes(access()?.profile.role);
  const canEdit = () => manager() && permission("inventory", "update");
  const canCreate = () => manager() && permission("inventory", "create");
  const canWarehouse = () => manager() && permission("warehouse", "update");
  const rows = () => inventoryRows(data || EMPTY_INVENTORY, filters);
  const variant = (id) => data?.variants.find((item) => item.id === id);
  const product = (id) => data?.products.find((item) => item.id === id);
  const locationName = (id) => {
    const loc = data?.locations.find((item) => item.id === id);
    const warehouse = data?.warehouses.find(
      (item) => item.id === loc?.warehouse_id,
    );
    return loc
      ? `${warehouse?.code || ""} / ${loc.code} · ${loc.name}`
      : "Unassigned — review required";
  };
  const action = (name, label, id = "", style = "ghost") =>
    `<button type="button" class="btn ${style} sm" data-action="inv-${name}" data-id="${e(id)}" ${busy ? "disabled" : ""}>${e(label)}</button>`;
  const select = (name, label, options, value = "", blank = "Select…") =>
    `<div class="field"><label for="inv-${name}">${e(label)}</label><select class="select" id="inv-${name}" name="${name}"><option value="">${e(blank)}</option>${options.map((item) => `<option value="${e(item.id)}" ${item.id === value ? "selected" : ""}>${e(item.name)}</option>`).join("")}</select></div>`;
  const input = (name, label, value = "", type = "text") =>
    `<div class="field"><label for="inv-${name}">${e(label)}</label><input class="input" id="inv-${name}" name="${name}" type="${type}" value="${e(value ?? "")}" ${type === "number" ? 'step="any"' : ""}></div>`;
  const activeLocations = () =>
    data.locations
      .filter(
        (item) =>
          item.active &&
          data.warehouses.some(
            (warehouse) =>
              warehouse.id === item.warehouse_id && warehouse.active,
          ),
      )
      .map((item) => ({ id: item.id, name: locationName(item.id) }));
  const photo = (paths, alt) =>
    paths?.[0]
      ? `<img data-inventory-image="${e(paths[0])}" alt="${e(alt)}" width="48" height="48" style="object-fit:cover;border-radius:8px">`
      : '<span class="icon-box" aria-label="No product image">▣</span>';

  async function refresh() {
    if (pending || lifecycle.disposed) return pending;
    pending = (async () => {
      try {
        const fresh = await backend.load();
        if (lifecycle.disposed) return;
        const changed =
          JSON.stringify(data) !== JSON.stringify(fresh) || Boolean(error);
        data = { ...EMPTY_INVENTORY, ...fresh };
        error = "";
        onData(data);
        if (changed && !modal) render();
      } catch (failure) {
        error = failure.message;
        data = null;
        modal = null;
        scanner.stop();
        if (!lifecycle.disposed) render();
      } finally {
        pending = null;
      }
    })();
    return pending;
  }
  function filter(name, label, options) {
    return select(name, label, options, filters[name], "All").replace(
      'name="',
      'data-inventory-filter="' + name + '" name="',
    );
  }
  function scan() {
    const match = scanVariant && variant(scanVariant);
    const p = match && product(match.product_id);
    const row =
      match && inventoryRows(data).find((row) => row.variant.id === match.id);
    return `<section class="card card-pad mt16"><h3>Find by barcode or SKU</h3><form id="inventory-scan" class="row wrap gap8"><label class="sr-only" for="inventory-code">Barcode or SKU</label><input id="inventory-code" class="input" name="code" value="${e(scanCode)}" placeholder="Scan or enter an exact SKU/barcode" autocomplete="off"><button type="submit" class="btn">Find variant</button>${action("camera", "Use camera")}${action("stop-camera", "Stop camera")}</form><p class="small muted">Handheld scanners: scan the code and press Enter. Confirm quantity and operation before stock is posted.</p><video id="inventory-camera" playsinline muted style="max-width:100%;max-height:240px"></video>${
      match
        ? `<div class="row wrap gap12 mt12">${photo(row.images, match.name)}<div class="grow"><strong>${e(p.name)} · ${e(match.name)}</strong><p>${e(match.sku)} · ${e(variationLabel(match))}</p><p class="small muted">${filters.location ? e(locationName(filters.location)) : "Select a warehouse/location before posting stock."}</p></div>${stockActions(match)}</div>`
        : unknown
          ? `<p role="status">Unknown code: ${e(scanCode)}. No product or stock was created.</p>${
              canCreate()
                ? action(
                    "unknown-product",
                    "Create product with this barcode",
                  ) +
                  select(
                    "unknown_product",
                    "Add variant to existing product",
                    data.products
                      .filter((p) => p.active)
                      .map((p) => ({ id: p.id, name: p.name })),
                  ) +
                  action("unknown-variant", "Create variant with this barcode")
                : ""
            }`
          : ""
    }</section>`;
  }
  function stockActions(v) {
    const available = v.active && product(v.product_id)?.active;
    return `<div class="row wrap gap6">${action("detail", "Details", v.id)}${canEdit() && available ? action("receive", "Add Stock", v.id) + action("adjust", "Adjust Stock", v.id) + action("transfer", "Transfer", v.id) + (data.job_items.some((i) => i.variant_id === v.id) ? action("reserve", "Reserve for job", v.id) + action("release", "Release reservation", v.id) : action("tab-jobs", "Allocate to job")) + action("threshold", "Low-stock threshold", v.id) : ""}${permission("warehouse", "view") && permission("jobs", "update") && available ? (data.job_items.some((i) => i.variant_id === v.id) ? action("issue", "Issue to job", v.id) : action("tab-jobs", "Job collections")) : ""}${canEdit() ? action("variant-edit", "Edit variant", v.id) : ""}</div>`;
  }
  function stockView() {
    const visible = rows();
    return `<div class="card card-pad"><div class="form-grid">${input("search", "Search name, SKU or barcode", filters.search).replace('name="search"', 'name="search" data-inventory-filter="search" data-focus="inventory-search"')}${filter(
      "warehouse",
      "Warehouse",
      data.warehouses.map((w) => ({ id: w.id, name: w.name })),
    )}${filter(
      "location",
      "Location",
      data.locations
        .filter(
          (l) => !filters.warehouse || l.warehouse_id === filters.warehouse,
        )
        .map((l) => ({ id: l.id, name: locationName(l.id) })),
    )}${filter("category", "Category", data.categories)}${filter(
      "variant",
      "Variant",
      data.variants.map((v) => ({
        id: v.id,
        name: `${v.sku} · ${variationLabel(v)}`,
      })),
    )}${filter("stock", "Stock status", [
      { id: "in", name: "In stock" },
      { id: "low", name: "Low stock" },
      { id: "out", name: "Out of stock" },
    ])}</div></div><div class="metric-grid mt16">${ctx.metric("On hand", String(visible.reduce((n, r) => n + r.onHand, 0)), "Selected warehouses / locations", "box")}${ctx.metric("Reserved", String(visible.reduce((n, r) => n + r.reserved, 0)), "Allocated to jobs", "box")}${ctx.metric("Available", String(visible.reduce((n, r) => n + r.available, 0)), "On hand − reserved", "box")}</div>${scan()}<section class="mt16">${visible.length ? visible.map((row) => `<article class="card card-pad mt12"><div class="row wrap gap12">${photo(row.images, row.variant.name)}<div class="grow"><strong>${e(row.product.name)} · ${e(row.variant.name)}</strong><p class="small muted">${e(row.variant.sku)} · ${e(variationLabel(row.variant))}</p></div>${ctx.badge(!row.variant.active || !row.product.active ? "Inactive" : row.status === "out" ? "Out of stock" : row.status === "low" ? "Low stock" : "In stock")}</div><p>On hand <strong>${row.onHand}</strong> · Reserved <strong>${row.reserved}</strong> · Available <strong>${row.available}</strong></p>${stockActions(row.variant)}</article>`).join("") : '<div class="card empty">No variants match these filters. Create a product or clear the filters.</div>'}</section>`;
  }
  function warehouseView() {
    return `<section>${manager() && permission("warehouse", "create") ? action("warehouse-new", "Create warehouse", "", "secondary") + action("location-new", "Create storage location", "", "secondary") : ""}${
      data.warehouses
        .map(
          (w) =>
            `<article class="card card-pad mt16"><div class="row wrap gap12"><div class="grow"><h3>${e(w.name)} · ${e(w.code)}</h3><p>${e(w.address || "")} ${e(w.postcode || "")}</p><p class="small muted">${w.latitude ?? ""} ${w.longitude ?? ""} · ${w.active ? "Active" : "Inactive"}</p></div>${canWarehouse() ? action("warehouse-edit", "Edit / deactivate", w.id) : ""}${manager() && permission("warehouse", "delete") ? action("delete_warehouse", "Delete unused", w.id) : ""}</div>${data.locations
              .filter((l) => l.warehouse_id === w.id)
              .map(
                (l) =>
                  `<div class="list-row"><div class="grow"><strong>${e(l.code)} · ${e(l.name)}</strong><div class="small muted">${e(l.level)} · ${l.parent_id ? e(locationName(l.parent_id)) : "Root location"} · ${l.active ? "Active" : "Inactive"}</div></div>${canWarehouse() ? action("location-edit", "Edit / deactivate", l.id) : ""}${manager() && permission("warehouse", "delete") ? action("delete_location", "Delete unused", l.id) : ""}</div>`,
              )
              .join("")}</article>`,
        )
        .join("") ||
      '<div class="card empty">No warehouses yet. Creating one adds a default storage location.</div>'
    }</section>`;
  }
  function receiptsView() {
    return `<section class="card card-pad mt16"><h3>Purchasing goods receipts</h3>${manager() && permission("purchasing", "create") ? action("po-new", "Create Purchase Order") + action("supplier-new", "Add supplier") : ""}<p class="small muted">PO deliveries use the existing transactional receipt service. Manual Add Stock is for non-PO receipts.</p>${data.purchase_orders.map((po) => `<div class="list-row"><div class="grow"><strong>PO ${e(po.po_number)}</strong><p class="small muted">${e(data.warehouses.find((w) => w.id === po.warehouse_id)?.name || "Warehouse needs review")} · ${e(po.status)}</p></div>${canEdit() && permission("purchasing", "update") ? action("po", "Receive remaining quantities", po.id) : ""}</div>`).join("") || "<p>No outstanding normalized purchase orders. Unmapped legacy orders remain in the review list.</p>"}</section>`;
  }
  function returnsView() {
    return `<section class="card card-pad mt16"><h3>Inspected returns</h3><p class="small muted">Request returns from issued allocations in Jobs. Match pickup, confirm warehouse delivery, then inspect usable/damaged quantities. Credits remain separate.</p>${data.return_items.map((r) => `<div class="list-row"><div class="grow"><strong>${e(variant(r.variant_id)?.name || r.variant_id)}</strong><p>Returned ${e(r.quantity)} · Pickup matched ${e(r.pickup_matched)} · ${r.delivered_at ? "Delivered" : "Awaiting warehouse delivery"}</p></div>${r.delivered_at ? (canEdit() ? action("return", "Inspect and restore usable stock", r.id) : "") : r.inventory_allocation_id ? (Number(r.pickup_matched) < Number(r.quantity) ? action("return_pickup", "Match return pickup", r.id) : canEdit() ? action("return_delivered", "Confirm warehouse delivery", r.id) : "") : ""}</div>`).join("") || "<p>No returns awaiting collection or inspection.</p>"}</section>`;
  }
  function jobsView() {
    const manage = canEdit() && permission("jobs", "view");
    const collect =
      permission("warehouse", "view") && permission("jobs", "update");
    return `<section class="card card-pad mt16"><h3>CRM job stock allocations</h3><p class="small muted">An authorized manager explicitly approves the product mapping, location and collector. Approved quantities reserve real stock. Issues are journaled once.</p>${manage ? action("allocate_job", "Approve a job allocation") : ""}${data.allocations.map((a) => `<article class="card card-pad mt12"><strong>${e(ctx.state.jobs.find((j) => j.id === a.job_id)?.number || a.job_id)} · ${e(variant(a.variant_id)?.sku)}</strong><p>${e(a.job_snapshot?.name || "")} · ${e(locationName(a.location_id))}</p><p>Approved ${a.quantity} · Reserved ${a.quantity_reserved} · Issued ${a.quantity_issued}</p><div class="row wrap gap6">${collect && Number(a.quantity_reserved) > 0 ? action("allocation_issue", "Scan and issue", a.id) : ""}${manage && Number(a.quantity_reserved) > 0 ? action("release_allocation", "Release reservation", a.id) : ""}${manage && Number(a.quantity_reserved) + Number(a.quantity_issued) < Number(a.quantity) ? action("reserve_allocation", "Reserve remaining", a.id) : ""}${collect && Number(a.quantity_issued) > 0 ? action("request_return", "Request return", a.id) : ""}</div></article>`).join("") || "<p>No job stock allocations yet.</p>"}${collect ? [...new Set(data.allocations.map((a) => a.job_id))].map((id) => `<div class="mt12">${action("complete_collection", `Confirm full collection · ${ctx.state.jobs.find((j) => j.id === id)?.number || id}`, id)}</div>`).join("") : ""}</section>`;
  }
  function view(mode = "inventory") {
    if (!data) {
      if (!error && !pending) void refresh();
      return `<section class="card card-pad"><h2>Warehouse inventory</h2>${error ? `<p role="alert">${e(error)}</p><p class="small muted">The inventory extension migration must be reviewed and deployed before using this screen.</p>${action("refresh", "Retry")}` : '<p role="status">Loading inventory…</p>'}</section>`;
    }
    if (mode === "purchasing") return receiptsView();
    if (mode === "returns") return returnsView();
    if (mode === "picking") return jobsView() + scan();
    return `${ctx.header("WAREHOUSE INVENTORY", "Products, locations and stock", "Stock is persisted in Supabase and posted through transactional commands.", canCreate() ? action("product-new", "Create product", "", "secondary") : "")}${notice ? `<div class="form-note" role="status">${e(notice)}</div>` : ""}${error ? `<div class="login-error" role="alert">${e(error)}</div>` : ""}<div class="card card-pad"><div class="row wrap gap8">${["stock", "warehouses", "jobs", "receipts", "returns", "review"].map((name) => action(`tab-${name}`, name[0].toUpperCase() + name.slice(1))).join("")}${action("refresh", "Refresh")}</div></div>${tab === "warehouses" ? warehouseView() : tab === "jobs" ? jobsView() : tab === "receipts" ? receiptsView() : tab === "returns" ? returnsView() : tab === "review" ? `<section class="card card-pad mt16"><h3>Assignments requiring review</h3><p>No legacy totals or identifiers are changed automatically.</p>${data.review.map((r) => `<p>${e(r.collection)} · ${e(r.id)} — ${e(r.reason)}</p>`).join("")}${data.unassigned_balances.map((b) => `<p>Balance ${e(b.id)}: ${e(b.quantity_on_hand)} on hand; location unassigned.</p>`).join("") || (data.review.length ? "" : "<p>No unclear assignments found.</p>")}</section>` : stockView()}`;
  }

  function renderModal() {
    if (!modal || !data) return "";
    const type = modal.type,
      values = modal.draft || {},
      v = variant(modal.id),
      p = product(modal.id),
      locs = activeLocations();
    let fields = "",
      title = "",
      save = true;
    if (type === "allocate_job") {
      title = "Approve stock allocation for a CRM job";
      fields =
        select(
          "legacy_item",
          "Job item requiring allocation",
          data.legacy_job_items.map((i) => ({
            id: i.id,
            name: `${i.job_number || i.job_id} · ${i.name} · ${i.quantity} required · ${i.sku || "SKU needs review"}`,
          })),
          values.legacy_item,
        ) +
        select(
          "variant_id",
          "Confirmed product variant",
          data.variants
            .filter((v) => v.active)
            .map((v) => ({
              id: v.id,
              name: `${v.sku} · ${variationLabel(v)}`,
            })),
          values.variant_id,
        ) +
        select(
          "location_id",
          "Warehouse / storage location",
          locs,
          values.location_id || filters.location,
        ) +
        select(
          "collector_id",
          "Authorized collector",
          data.collectors,
          values.collector_id,
        ) +
        `<label><input type="checkbox" name="mapping_confirmed" ${values.mapping_confirmed ? "checked" : ""}> I confirm the job item, quantity and selected variant mapping.</label>`;
    } else if (
      [
        "allocation_issue",
        "reserve_allocation",
        "release_allocation",
        "request_return",
        "return_pickup",
        "return_delivered",
        "complete_collection",
      ].includes(type)
    ) {
      const allocation = data.allocations.find((a) => a.id === modal.id);
      const returned = data.return_items.find((r) => r.id === modal.id);
      const target = variant(allocation?.variant_id || returned?.variant_id);
      title = {
        allocation_issue: "Confirm allocated job issue",
        reserve_allocation: "Reserve approved stock",
        release_allocation: "Release approved stock",
        request_return: "Request an issued-product return",
        return_pickup: "Confirm return pickup",
        return_delivered: "Confirm warehouse delivery",
        complete_collection: "Confirm complete collection",
      }[type];
      fields = `<p>${e(target?.sku || modal.id)} · ${e(variationLabel(target))}</p>`;
      if (!["return_delivered", "complete_collection"].includes(type))
        fields +=
          input(
            "quantity",
            "Quantity",
            values.quantity ??
              (returned?.quantity || allocation?.quantity_reserved || 1),
            "number",
          ) +
          input("reason", "Reason", values.reason) +
          input("reference", "Reference", values.reference);
      if (type === "request_return")
        fields += select(
          "location_id",
          "Return warehouse / location",
          locs,
          values.location_id || filters.location,
        );
      if (["allocation_issue", "return_pickup"].includes(type))
        fields +=
          input("code", "Scan or enter the exact SKU / barcode", values.code) +
          action("camera", "Scan with camera") +
          '<video id="inventory-camera-modal" playsinline muted style="max-width:100%;max-height:220px"></video>';
      if (type === "complete_collection")
        fields +=
          "<p>Every required job item must have its approved quantity issued. This confirms the handover without deducting stock again.</p>";
    } else if (type === "supplier-new") {
      title = "Supplier";
      fields =
        input("name", "Supplier name", values.name) +
        input("code", "Supplier code (optional)", values.code) +
        input("email", "Email", values.email, "email") +
        input("phone", "Phone", values.phone);
    } else if (type === "po-new") {
      title = "Create Purchase Order";
      fields =
        select("supplier_id", "Supplier", data.suppliers, values.supplier_id) +
        select(
          "warehouse_id",
          "Receiving warehouse",
          data.warehouses.filter((w) => w.active),
          values.warehouse_id || filters.warehouse,
        ) +
        input("notes", "Notes", values.notes) +
        "<p>Enter a quantity for each variant to order. Leave other lines at zero.</p>" +
        data.variants
          .filter((v) => v.active)
          .map(
            (v) =>
              `<fieldset><legend>${e(v.sku)} · ${e(variationLabel(v))}</legend>${input(`order_${v.id}`, "Order quantity", values[`order_${v.id}`] || 0, "number")}${input(`cost_${v.id}`, "Unit cost", values[`cost_${v.id}`] ?? v.cost_price ?? product(v.product_id)?.cost_price ?? 0, "number")}</fieldset>`,
          )
          .join("");
    } else if (type === "detail") {
      title = "Product details";
      save = false;
      const row = inventoryRows(data).find((r) => r.variant.id === modal.id);
      fields = `${photo(row.images, v.name)}<h3>${e(row.product.name)} · ${e(v.name)}</h3><p>${e(row.product.description || "")}</p><p>${e(v.sku)} · ${e(variationLabel(v))}</p><p>Cost ${ctx.money(v.cost_price ?? row.product.cost_price)} · Sale ${ctx.money(v.sale_price ?? row.product.sale_price)}</p><div class="row wrap gap8">${canEdit() ? action("product-edit", "Edit product", v.product_id) + action("variant-new", "Add variation", v.product_id) : ""}</div><h4 class="mt16">Per-location stock</h4>${row.balances.map((b) => `<p>${e(locationName(b.location_id))}: ${b.quantity_on_hand} on hand · ${b.quantity_reserved} reserved · ${Number(b.quantity_on_hand) - Number(b.quantity_reserved)} available</p>`).join("") || "<p>No stock posted for this variant.</p>"}<h4>Movement history</h4>${
        (modal.history || data.movements.filter((m) => m.variant_id === v.id))
          .map(
            (m) =>
              `<div class="list-row"><div><strong>${e(m.movement_type)} · ${e(m.quantity)}</strong><p class="small muted">${e(m.notes)} · ${e(m.reference_text || m.reference_type || "")}<br>${e(m.from_location_id ? locationName(m.from_location_id) : "External")} → ${e(m.to_location_id ? locationName(m.to_location_id) : "External")}<br>Actor ${e(m.created_by)} · ${e(m.created_at)}<br>Snapshot ${e(m.variant_snapshot?.sku || "")} ${e(JSON.stringify(m.variant_snapshot?.attributes || {}))}</p></div></div>`,
          )
          .join("") || "<p>No movements yet.</p>"
      }${modal.moreHistory ? action("history", "Load older movements", v.id) : ""}`;
    } else if (
      ["product-new", "product-edit", "variant-new", "variant-edit"].includes(
        type,
      )
    ) {
      const editing = type.endsWith("edit"),
        isVariant = type.startsWith("variant");
      const record = { ...(isVariant ? v : p), ...values };
      const supplier =
        record.supplier_id ??
        record.default_supplier_id ??
        record.metadata?.supplier_id;
      title = isVariant ? "Product variant" : "Product catalogue";
      fields =
        input("name", "Name", record.name || "") +
        input("sku", "SKU", record.sku || "") +
        (!isVariant
          ? `<div class="field"><label for="inv-description">Description</label><textarea id="inv-description" name="description" class="textarea">${e(record.description || "")}</textarea></div>`
          : "") +
        (isVariant || !editing
          ? input(
              "barcode",
              "Barcode (optional)",
              record.barcode ||
                modal.barcode ||
                (isVariant
                  ? data.barcodes.find(
                      (b) => b.variant_id === v?.id && b.is_primary,
                    )?.barcode
                  : "") ||
                "",
            )
          : '<p class="small muted">Edit each sellable variant’s barcode using Edit variant.</p>') +
        input("brand", "Brand", record.brand ?? record.metadata?.brand ?? "") +
        select("supplier_id", "Supplier", data.suppliers, supplier) +
        (!isVariant
          ? select(
              "category_id",
              "Category",
              data.categories,
              record.category_id,
            ) +
            input(
              "category_name",
              "New category (optional)",
              record.category_name || "",
            ) +
            input("unit", "Unit of measure", record.unit || "each")
          : "") +
        input("cost_price", "Cost price", record.cost_price ?? 0, "number") +
        input("sale_price", "Selling price", record.sale_price ?? 0, "number") +
        select(
          "active",
          "Status",
          [
            { id: "true", name: "Active" },
            { id: "false", name: "Inactive" },
          ],
          String(record.active ?? true),
        );
      if (isVariant || !editing)
        fields += `<div class="field"><label for="inv-attributes">Variations / custom attributes</label><textarea class="textarea" name="attributes" id="inv-attributes" placeholder="Colour: White&#10;Size: 120 cm&#10;Material: Aluminium">${e(
          typeof record.attributes === "string"
            ? record.attributes
            : Object.entries(record.attributes || {})
                .map(([k, v]) => `${k}: ${v}`)
                .join("\n"),
        )}</textarea><p class="small muted">One Attribute: Value per line. Each sellable combination gets its own SKU. Empty attributes create a default variant.</p></div>`;
      if (!isVariant && !editing)
        fields +=
          select(
            "location_id",
            "Opening-stock warehouse / location",
            locs,
            record.location_id || filters.location,
          ) +
          input(
            "opening_quantity",
            "Opening quantity",
            record.opening_quantity ?? 0,
            "number",
          );
      if (editing || isVariant)
        fields +=
          '<p class="small muted">This form does not change stock. Use Add Stock or Adjust Stock.</p>';
      fields += `<div class="field"><label for="inventory-images">Images (JPEG/PNG/WebP, up to 5 MB each)</label><input id="inventory-images" name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple><label><input type="checkbox" name="replace_images"> Replace existing images only after successful upload</label><p id="inventory-upload-progress" role="status"></p></div><div class="row wrap gap8">${(modal.images || []).map((path, index) => `<div>${photo([path], record.name || "Product")}<p class="small">${index === 0 ? "Main image" : ""}</p>${action("image-main", "Make main", String(index))}${action("image-remove", "Remove", String(index))}</div>`).join("")}</div>`;
    } else if (type === "warehouse-new" || type === "warehouse-edit") {
      const w = {
        ...(data.warehouses.find((w) => w.id === modal.id) || {}),
        ...values,
      };
      title = "Warehouse";
      fields =
        input("name", "Warehouse name", w.name) +
        input("code", "Unique code", w.code) +
        input("address", "Address", w.address) +
        input("postcode", "Postcode", w.postcode) +
        input("latitude", "Latitude (optional)", w.latitude, "number") +
        input("longitude", "Longitude (optional)", w.longitude, "number") +
        select(
          "active",
          "Status",
          [
            { id: "true", name: "Active" },
            { id: "false", name: "Inactive" },
          ],
          String(w.active ?? true),
        );
    } else if (type === "location-new" || type === "location-edit") {
      const l = {
        ...(data.locations.find((l) => l.id === modal.id) || {}),
        ...values,
      };
      title = "Storage location";
      fields =
        select(
          "warehouse_id",
          "Warehouse",
          data.warehouses.filter((w) => w.active),
          l.warehouse_id || filters.warehouse,
        ) +
        input("code", "Location code", l.code) +
        input("name", "Location name", l.name) +
        select(
          "level",
          "Level",
          ["zone", "aisle", "rack", "shelf", "bin"].map((level) => ({
            id: level,
            name: level,
          })),
          l.level || "bin",
        ) +
        select(
          "parent_id",
          "Parent location (optional)",
          data.locations
            .filter((x) => x.id !== modal.id)
            .map((x) => ({ id: x.id, name: locationName(x.id) })),
          l.parent_id,
        ) +
        select(
          "active",
          "Status",
          [
            { id: "true", name: "Active" },
            { id: "false", name: "Inactive" },
          ],
          String(l.active ?? true),
        );
    } else if (type === "po") {
      const po = data.purchase_orders.find((p) => p.id === modal.id);
      title = `Receive PO ${po.po_number}`;
      fields =
        "<p>Confirm remaining quantities and receiving bins. Already received quantities cannot be counted again.</p>" +
        data.purchase_items
          .filter((i) => i.purchase_order_id === po.id)
          .map(
            (i) =>
              `<fieldset><legend>${e(variant(i.variant_id)?.sku || i.variant_id)}</legend>${input(`qty_${i.id}`, "Quantity to receive", Number(i.quantity_ordered) - Number(i.quantity_received), "number")}${select(
                `loc_${i.id}`,
                "Receiving location",
                locs.filter(
                  (l) =>
                    data.locations.find((x) => x.id === l.id)?.warehouse_id ===
                    po.warehouse_id,
                ),
                filters.location,
              )}</fieldset>`,
          )
          .join("");
    } else if (type.startsWith("delete_")) {
      title = "Confirm deletion";
      fields =
        "<p>Delete this unused record? Stock or referenced history will prevent deletion. Deactivation preserves history.</p>";
    } else {
      title = {
        receive: "Add Stock",
        adjust: "Stock adjustment",
        transfer: "Transfer stock",
        reserve: "Reserve stock",
        release: "Release reservation",
        issue: "Confirm job issue",
        return: "Inspect return",
        threshold: "Low-stock threshold",
      }[type];
      const rv =
        type === "return"
          ? data.return_items.find((r) => r.id === modal.id)
          : null;
      const selected = rv ? variant(rv.variant_id) : v;
      fields =
        `<h3>${e(product(selected?.product_id)?.name)} · ${e(selected?.sku)}</h3><p>${e(variationLabel(selected))}</p>` +
        select(
          "location_id",
          "Warehouse / storage location",
          locs,
          values.location_id || filters.location,
        ) +
        (type === "transfer"
          ? select(
              "destination_id",
              "Destination warehouse / location",
              locs,
              values.destination_id,
            )
          : "") +
        (type === "threshold"
          ? input(
              "threshold",
              "Low-stock threshold",
              values.threshold ?? 0,
              "number",
            )
          : input(
              "quantity",
              type === "return"
                ? "Usable quantity"
                : type === "adjust"
                  ? "Signed quantity (+ / −)"
                  : "Quantity",
              values.quantity ?? (rv?.quantity || 1),
              "number",
            )) +
        (type === "return"
          ? input(
              "damaged_quantity",
              "Damaged quantity (does not become available)",
              values.damaged_quantity ?? 0,
              "number",
            )
          : "") +
        (["reserve", "release", "issue"].includes(type)
          ? select(
              "job_item_id",
              "Authorized job item",
              data.job_items
                .filter((i) => i.variant_id === selected?.id)
                .map((i) => ({
                  id: i.id,
                  name: `Job ${i.job_number} · ${i.description} · ${i.quantity_issued}/${i.quantity} issued`,
                })),
              values.job_item_id,
            )
          : "") +
        input("reason", "Reason", values.reason) +
        input("reference", "Reference", values.reference) +
        (type === "receive"
          ? '<p class="small muted">For deliveries linked to purchase orders, use the Purchasing goods receipts tab.</p>'
          : "") +
        '<p class="small muted">Confirm the variant, warehouse, location and quantity before saving.</p>';
    }
    return ctx.modalFrame(
      title || "Inventory",
      notice,
      `<form id="inventory-form"><div class="form-stack">${fields}</div></form>${error ? `<div role="alert" class="login-error">${e(error)}</div>` : ""}`,
      "",
      "inv-cancel",
      action("cancel", "Cancel") +
        (save
          ? action(
              "save",
              busy ? "Saving…" : "Confirm and save",
              "",
              "secondary",
            )
          : ""),
    );
  }

  async function lookup(code) {
    scanner.stop();
    scanCode = String(code || "").trim();
    try {
      const matched = findVariant(data, scanCode);
      scanVariant = matched?.id || null;
      unknown = !matched;
      error = "";
    } catch (failure) {
      error = failure.message;
      scanVariant = null;
      unknown = false;
    }
    render();
  }
  async function handle(el) {
    const name = el.dataset.action;
    if (!name?.startsWith("inv-")) return false;
    if (busy) return true;
    const type = name.slice(4),
      id = el.dataset.id;
    if (type === "refresh") {
      error = "";
      await refresh();
      return true;
    }
    if (!data) return true;
    if (type === "cancel") {
      modal = null;
      error = "";
      scanner.stop();
      render();
      return true;
    }
    if (type.startsWith("tab-")) {
      tab = type.slice(4);
      scanner.stop();
      render();
      return true;
    }
    if (type === "camera") {
      try {
        await scanner.start(
          ctx.$("#inventory-camera-modal") || ctx.$("#inventory-camera"),
          (code) => {
            const field = ctx.$('#inventory-form [name="code"]');
            if (field) field.value = code;
            else void lookup(code);
          },
          (failure) => {
            error = failure.message;
            render();
          },
        );
      } catch (failure) {
        error = failure.message;
        render();
      }
      return true;
    }
    if (type === "stop-camera") {
      scanner.stop();
      return true;
    }
    if (type === "history" && modal?.type === "detail") {
      try {
        const page = await backend.history(
          modal.id,
          modal.history?.length || 0,
        );
        modal.history = [...(modal.history || []), ...page];
        modal.moreHistory = page.length === 100;
      } catch (failure) {
        error = failure.message;
      }
      render();
      return true;
    }
    if (type === "image-main" || type === "image-remove") {
      const index = Number(id);
      const path = modal.images.splice(index, 1)[0];
      if (type === "image-main") modal.images.unshift(path);
      render();
      return true;
    }
    if (type === "unknown-product") {
      modal = { type: "product-new", barcode: scanCode, images: [] };
      error = "";
      render();
      return true;
    }
    if (type === "unknown-variant") {
      const pid = ctx.$("#inv-unknown_product")?.value;
      if (!pid) {
        error = "Choose a product for the new variant";
        render();
        return true;
      }
      modal = {
        type: "variant-new",
        productId: pid,
        barcode: scanCode,
        images: [],
      };
      error = "";
      render();
      return true;
    }
    if (type !== "save") {
      scanner.stop();
      modal = {
        type,
        id,
        images: [
          ...(["product-edit"].includes(type)
            ? product(id)?.image_paths || []
            : type === "variant-edit"
              ? variant(id)?.image_paths || []
              : []),
        ],
      };
      if (type === "variant-new") modal.productId = id;
      if (type === "detail" && backend.history) {
        const opened = modal;
        void backend
          .history(id, 0)
          .then((history) => {
            if (modal === opened && !lifecycle.disposed) {
              modal.history = history;
              modal.moreHistory = history.length === 100;
              render();
            }
          })
          .catch((failure) => {
            if (modal === opened) {
              error = failure.message;
              render();
            }
          });
      }
      error = "";
      notice = "";
      render();
      return true;
    }
    const form = ctx.$("#inventory-form");
    if (!form || !modal) return true;
    const fd = new FormData(form),
      values = Object.fromEntries(
        [...fd.entries()].filter(([, value]) => !(value instanceof File)),
      );
    const current = modal;
    scanner.stop();
    current.draft = values;
    busy = true;
    error = "";
    ctx
      .$$('button[data-action^="inv-"]')
      .forEach((button) => (button.disabled = true));
    try {
      let payload = { ...values },
        command = current.type;
      if (command === "allocate_job") {
        const item = data.legacy_job_items.find(
          (i) => i.id === values.legacy_item,
        );
        if (!item) throw new Error("Choose a job item");
        payload = {
          job_id: item.job_id,
          item_id: item.item_id,
          quantity: Number(item.quantity),
          variant_id: values.variant_id,
          location_id: values.location_id,
          collector_id: values.collector_id,
          mapping_confirmed: values.mapping_confirmed === "on",
        };
      } else if (
        [
          "allocation_issue",
          "reserve_allocation",
          "release_allocation",
          "request_return",
          "return_pickup",
          "return_delivered",
          "complete_collection",
        ].includes(command)
      ) {
        if (command === "complete_collection") payload = { job_id: current.id };
        else if (command.startsWith("return_")) {
          const item = data.return_items.find((r) => r.id === current.id);
          payload = {
            ...values,
            return_item_id: current.id,
            variant_id: item?.variant_id,
          };
          if (
            command === "return_pickup" &&
            findVariant(data, values.code)?.id !== item?.variant_id
          )
            throw new Error("Scan the exact returned variant");
        } else {
          const allocation = data.allocations.find((a) => a.id === current.id);
          payload = { ...values, allocation_id: current.id };
          if (
            command === "allocation_issue" &&
            findVariant(data, values.code)?.id !== allocation?.variant_id
          )
            throw new Error("Scan the exact allocated variant");
        }
        delete payload.code;
      } else if (command === "supplier-new") {
        command = "supplier";
      } else if (command === "po-new") {
        payload = {
          supplier_id: values.supplier_id,
          warehouse_id: values.warehouse_id,
          notes: values.notes,
          items: data.variants
            .filter((v) => Number(values[`order_${v.id}`]) > 0)
            .map((v) => ({
              variant_id: v.id,
              quantity: Number(values[`order_${v.id}`]),
              unit_cost: Number(values[`cost_${v.id}`]),
            })),
        };
        command = "purchase_order";
      } else if (
        ["product-new", "product-edit", "variant-new", "variant-edit"].includes(
          command,
        )
      ) {
        const files = fd
          .getAll("images")
          .filter((file) => file instanceof File && file.size > 0);
        const uploaded = [];
        if (
          files.length + (values.replace_images ? 0 : current.images.length) >
          8
        )
          throw new Error("Maximum eight images per product/variant");
        for (const [index, file] of files.entries()) {
          const path = await backend.upload(file, (percent) => {
            const progress = ctx.$("#inventory-upload-progress");
            if (progress)
              progress.textContent = `Uploading image ${index + 1}/${files.length}: ${percent === 100 ? "complete" : "in progress…"}`;
          });
          uploaded.push(path);
        }
        payload.image_paths = [
          ...(values.replace_images && files.length ? [] : current.images),
          ...uploaded,
        ];
        delete payload.replace_images;
        payload.active = values.active === "true";
        if (values.attributes !== undefined)
          payload.attributes = attributes(values.attributes);
        if (command.endsWith("edit")) payload.id = current.id;
        if (command.startsWith("variant")) {
          payload.product_id =
            current.productId || variant(current.id)?.product_id;
          command = "variant";
        } else command = "product";
      } else if (
        command.startsWith("warehouse-") ||
        command.startsWith("location-")
      ) {
        payload.active = values.active === "true";
        if (command.endsWith("edit")) payload.id = current.id;
        command = command.startsWith("warehouse") ? "warehouse" : "location";
      } else if (command === "po") {
        const lines = data.purchase_items
          .filter(
            (i) =>
              i.purchase_order_id === current.id &&
              Number(values[`qty_${i.id}`]) > 0,
          )
          .map((i) => ({
            purchase_order_item_id: i.id,
            quantity: Number(values[`qty_${i.id}`]),
            location_id: values[`loc_${i.id}`],
          }));
        const signature = JSON.stringify(lines);
        if (current.signature !== signature) {
          current.signature = signature;
          current.key = crypto.randomUUID();
        }
        await backend.receivePO(
          current.id,
          lines,
          current.key || (current.key = crypto.randomUUID()),
        );
      } else if (command.startsWith("delete_")) payload.id = current.id;
      else {
        payload.variant_id =
          command === "return"
            ? data.return_items.find((r) => r.id === current.id)?.variant_id
            : current.id;
        if (command === "return") {
          payload.return_item_id = current.id;
          command = "inspect_return";
        }
      }
      if (current.type !== "po") {
        // Keep the same key for an identical explicit retry after a network error.
        const signature = JSON.stringify({ command, payload });
        if (current.signature !== signature) {
          current.signature = signature;
          current.key = crypto.randomUUID();
        }
        const result = await backend.command(command, payload, current.key);
        if (result.job) ctx.inventoryCollectionConfirmed(result.job);
      }
      modal = null;
      notice = "Change confirmed by the backend.";
      await refresh();
    } catch (failure) {
      error = failure.message;
    } finally {
      busy = false;
      if (!lifecycle.disposed) render();
    }
    return true;
  }
  function hydrateImages() {
    for (const img of ctx.$$("[data-inventory-image]")) {
      const path = img.dataset.inventoryImage,
        cached = urls.get(path);
      if (cached && cached.until > Date.now()) {
        img.src = cached.url;
        continue;
      }
      void backend
        .imageURL(path)
        .then((url) => {
          if (!lifecycle.disposed && img.isConnected) {
            urls.set(path, { url, until: Date.now() + 240000 });
            img.src = url;
          }
        })
        .catch((failure) => {
          if (img.isConnected) {
            img.alt = `Image unavailable: ${failure.message}`;
            img.title = failure.message;
          }
        });
    }
  }
  lifecycle.listen(
    ctx.root,
    "submit",
    (event) => {
      if (event.target.id === "inventory-scan") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!busy) void lookup(new FormData(event.target).get("code"));
      }
      if (event.target.id === "inventory-form") {
        event.preventDefault();
        event.stopImmediatePropagation();
        void handle({ dataset: { action: "inv-save" } });
      }
    },
    { capture: true },
  );
  lifecycle.listen(
    ctx.root,
    "keydown",
    (event) => {
      if (
        event.key === "Enter" &&
        ["allocation_issue", "return_pickup"].includes(modal?.type) &&
        event.target.matches('#inventory-form [name="code"]')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!busy) void handle({ dataset: { action: "inv-save" } });
      }
    },
    { capture: true },
  );
  lifecycle.listen(ctx.root, "input", (event) => {
    const name = event.target.dataset.inventoryFilter;
    if (name === "search") {
      filters.search = event.target.value;
      render();
    }
  });
  lifecycle.listen(ctx.root, "change", (event) => {
    const name = event.target.dataset.inventoryFilter;
    if (name && name !== "search") {
      filters[name] = event.target.value;
      if (name === "warehouse") filters.location = "";
      render();
    }
  });
  lifecycle.listen(window, "focus", () => {
    if (data && !busy) void refresh();
  });
  lifecycle.listen(window, "online", () => {
    if (data && !busy) void refresh();
  });
  lifecycle.setInterval(() => {
    if (data && !busy) void refresh();
  }, 30000);
  const stopWatch = backend.watch(() => {
    if (data && !busy) void refresh();
  });
  return {
    view,
    renderModal,
    handle,
    refresh,
    hydrateImages,
    stopCamera: scanner.stop,
    dispose() {
      scanner.stop();
      stopWatch();
    },
    get data() {
      return data;
    },
  };
}
