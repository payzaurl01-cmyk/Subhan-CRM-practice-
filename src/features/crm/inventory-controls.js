import {
  EMPTY_INVENTORY,
  attributes,
  inventoryRows,
  imageLinks,
  stockMoveArgs,
  variationLabel,
  validateImage,
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
  let data = initial?.data ? { ...EMPTY_INVENTORY, ...initial.data } : null;
  let error = initial?.error || "",
    notice = "",
    busy = false,
    loading = null,
    modal = null;
  let tab = "stock",
    scanCode = "",
    matches = [],
    selected = "",
    unknown = false,
    lookupVersion = 0;
  let options = { categories: [], suppliers: [] },
    optionsError = "";
  let purchasing = null,
    purchaseError = "",
    purchaseLoading = false;
  const filters = {
    search: "",
    warehouse: "",
    location: "",
    stock: "",
    archived: "",
  };
  const scanner = createInventoryScanner(),
    urls = new Map(),
    signing = new Map();
  const e = ctx.esc;
  const permission = (module, action) =>
    access()?.modules?.some(
      (m) => m.key === module && m[`can_${action}`] === true,
    );
  const manager = () =>
    access()?.profile?.status === "active" &&
    ["super_admin", "admin", "manager"].includes(access()?.profile?.role);
  const edit = (module = "inventory") =>
    manager() && permission(module, "view") && permission(module, "update");
  const create = (module = "inventory") =>
    edit(module) && permission(module, "create");
  const moveAllowed = () => edit() && permission("warehouse", "view");
  const product = (id) => data?.products.find((p) => p.id === id);
  const variant = (id) => data?.variants.find((v) => v.id === id);
  const location = (id) => data?.locations.find((l) => l.id === id);
  const warehouse = (id) => data?.warehouses.find((w) => w.id === id);
  const locationName = (id) => {
    const l = location(id);
    return l
      ? `${warehouse(l.warehouse_id)?.name || "Warehouse"} / ${l.code} · ${l.name}`
      : "Location unavailable";
  };
  const activeLocations = () =>
    data.locations
      .filter((l) => l.active && warehouse(l.warehouse_id)?.active)
      .map((l) => ({ id: l.id, name: locationName(l.id) }));
  const button = (name, label, id = "", style = "ghost") =>
    `<button type="button" class="btn ${style} sm" data-action="inv-${name}" data-id="${e(id)}" ${busy ? "disabled" : ""}>${e(label)}</button>`;
  const input = (name, label, value = "", type = "text") =>
    `<div class="field"><label for="inv-${name}">${e(label)}</label><input class="input" id="inv-${name}" name="${name}" type="${type}" value="${e(value ?? "")}" ${type === "number" ? 'step="any"' : ""}></div>`;
  const select = (name, label, options, value = "", blank = "Select…") =>
    `<div class="field"><label for="inv-${name}">${e(label)}</label><select class="select" id="inv-${name}" name="${name}"><option value="">${e(blank)}</option>${options.map((o) => `<option value="${e(o.id)}" ${String(o.id) === String(value) ? "selected" : ""}>${e(o.name)}</option>`).join("")}</select></div>`;
  const status = (value) =>
    select(
      "active",
      "Status",
      [
        { id: "true", name: "Active" },
        { id: "false", name: "Archived" },
      ],
      String(value ?? true),
    );
  const photo = (image, label, size = 48) =>
    image
      ? `<img data-inventory-image="${e(image.object_path)}" alt="${e(image.alt_text || label)}" width="${size}" height="${size}" style="object-fit:cover;border-radius:8px">`
      : '<span class="icon-box" aria-label="No product image">▣</span>';
  const storageKey = () =>
    `crm-inventory-operation-v1:${access()?.profile?.id || "session"}`;
  let recovery = null;
  try {
    recovery = JSON.parse(sessionStorage.getItem(storageKey()) || "null");
  } catch {
    /* A malformed local retry record must not affect server data. */
  }
  function remember(operation) {
    // This is an operation receipt, never a local inventory ledger. Persist before posting.
    sessionStorage.setItem(storageKey(), JSON.stringify(operation));
    recovery = operation;
  }
  function forget() {
    sessionStorage.removeItem(storageKey());
    recovery = null;
  }
  async function post(operation) {
    remember(operation);
    try {
      if (operation.kind === "po")
        await backend.receivePO(operation.id, operation.lines, operation.key);
      else await backend.move(operation.args);
      forget();
    } catch (failure) {
      // A SQL rejection confirms that the transaction rolled back. Transport failures stay retryable.
      if (/^(P0001|22|23|42)/.test(failure.code || "")) forget();
      throw failure;
    }
  }
  async function loadOptions() {
    if (!permission("inventory", "view") || !manager()) return;
    try {
      options = await backend.options(permission("purchasing", "view"));
      optionsError = "";
      if (data) {
        data = { ...data, ...options };
        onData(data);
      }
    } catch (f) {
      optionsError = `Catalogue choices could not load: ${f.message}`;
    }
    if (!modal && !lifecycle.disposed) render();
  }
  async function refresh(force = false) {
    if (lifecycle.disposed) return;
    if (loading) {
      await loading;
      if (!force || lifecycle.disposed) return;
    }
    loading = (async () => {
      try {
        const fresh = await backend.load(access());
        if (lifecycle.disposed) return;
        data = { ...EMPTY_INVENTORY, ...fresh, ...options };
        error = "";
        onData(data);
        if (tab === "warehouses" && permission("warehouse", "view")) {
          const wh = await backend.warehouses();
          if (lifecycle.disposed) return;
          data.warehouses = wh.warehouses;
          data.locations = wh.locations;
        }
      } catch (failure) {
        if (failure.code === "42501") data = null;
        error = failure.message;
      } finally {
        loading = null;
        if (!lifecycle.disposed && !modal) render();
      }
    })();
    return loading;
  }
  async function loadPurchasing() {
    if (purchaseLoading || !permission("purchasing", "view")) return;
    purchaseLoading = true;
    try {
      purchasing = await backend.purchasing();
      purchaseError = "";
    } catch (failure) {
      purchaseError = failure.message;
    } finally {
      purchaseLoading = false;
      if (!lifecycle.disposed) render();
    }
  }
  function scanView() {
    const v = variant(selected),
      p = product(v?.product_id);
    return `<section class="card card-pad mt16"><h3>Find by barcode or SKU</h3><form id="inventory-scan" class="row wrap gap8"><label class="sr-only" for="inventory-code">Barcode or SKU</label><input id="inventory-code" class="input" name="code" value="${e(scanCode)}" placeholder="Scan or enter an exact SKU/barcode" autocomplete="off"><button class="btn" type="submit" ${busy ? "disabled" : ""}>Find variant</button>${button("camera", "Use camera")}${button("stop-camera", "Stop camera")}</form><p class="small muted">Handheld scanners: scan the code and press Enter. Review the variant and quantity before posting stock.</p><video id="inventory-camera" playsinline muted style="max-width:100%;max-height:240px"></video>${matches.length > 1 ? `<p role="status">Multiple variants match this code. Choose the intended variant.</p>${matches.map((v) => button("scan-choice", `${v.sku} · ${v.name} · ${variationLabel(v)}`, v.id)).join("")}` : ""}${
      v && p
        ? `<div class="mt12"><strong>${e(p.name)} · ${e(v.name)}</strong><p>${e(v.sku)} · ${e(variationLabel(v))}</p>${stockActions(v)}</div>`
        : unknown
          ? `<p role="status">Unknown code: ${e(scanCode)}. No product or stock was created.</p>${
              create()
                ? button(
                    "unknown-product",
                    "Create product with this barcode",
                  ) +
                  select(
                    "unknown_product",
                    "Add variant to existing product",
                    data.products.filter((p) => p.active),
                    "",
                  ) +
                  button("unknown-variant", "Create variant with this barcode")
                : ""
            }`
          : ""
    }</section>`;
  }
  function stockActions(v) {
    const active = v.active && product(v.product_id)?.active;
    return `<div class="row wrap gap6">${button("detail", "Details", v.id)}${moveAllowed() && active ? button("receive", "Add Stock", v.id) + button("adjust", "Adjust Stock", v.id) + button("transfer", "Transfer", v.id) : ""}${edit() ? button("variant-edit", "Edit variant", v.id) : ""}</div>`;
  }
  function stockView() {
    const filter = (name, label, options) =>
      select(name, label, options, filters[name], "All").replace(
        'name="',
        `data-inventory-filter="${name}" name="`,
      );
    const visible = inventoryRows(data, filters).filter(
      (r) =>
        filters.archived === "all" ||
        (filters.archived === "archived"
          ? !r.product.active || !r.variant.active
          : r.product.active && r.variant.active),
    );
    const s = data.summary;
    return `<div class="metric-grid mt16">${ctx.metric("Stock value", ctx.money(s.stock_value), "On hand × current cost", "receipt")}${ctx.metric("On hand", String(s.on_hand), "All accessible balances", "box")}${ctx.metric("Reserved", String(s.reserved), "Allocated stock", "box")}${ctx.metric("Available", String(s.available), "On hand − reserved", "box")}${ctx.metric("Low-stock variants", String(s.low_stock_variants), "Low in at least one location", "box")}${ctx.metric("Products / warehouses", `${s.product_count} / ${s.warehouse_count}`, "Inventory summary", "box")}</div><div class="card card-pad mt16"><div class="form-grid">${input("search", "Search name, SKU or barcode", filters.search).replace('name="search"', 'name="search" data-inventory-filter="search" data-focus="inventory-search"')}${filter(
      "warehouse",
      "Warehouse",
      data.warehouses.filter((w) => w.active),
    )}${filter(
      "location",
      "Location",
      data.locations
        .filter(
          (l) =>
            l.active &&
            (!filters.warehouse || l.warehouse_id === filters.warehouse),
        )
        .map((l) => ({ id: l.id, name: locationName(l.id) })),
    )}${filter("stock", "Stock status", [
      { id: "in", name: "In stock" },
      { id: "low", name: "Low stock" },
      { id: "out", name: "Out of stock" },
    ])}${filter("archived", "Catalogue status", [
      { id: "all", name: "Include archived" },
      { id: "archived", name: "Archived only" },
    ])}</div></div>${scanView()}${visible.map((r) => `<article class="card card-pad mt12"><div class="row wrap gap12">${photo(imageLinks(data, r.product.id, r.variant.id)[0], r.variant.name)}<div class="grow"><strong>${e(r.product.name)} · ${e(r.variant.name)}</strong><p>${e(r.variant.sku)} · ${e(variationLabel(r.variant))}</p></div>${ctx.badge(!r.product.active || !r.variant.active ? "Archived" : r.status === "out" ? "Out of stock" : r.status === "low" ? "Low stock" : "In stock")}</div><p>On hand <strong>${r.onHand}</strong> · Reserved <strong>${r.reserved}</strong> · Available <strong>${r.available}</strong> · Damaged <strong>${r.damaged}</strong></p>${stockActions(r.variant)}</article>`).join("") || '<div class="card empty mt16">No variants match these filters. Create a product or clear the filters.</div>'}`;
  }
  function warehouseView() {
    return `${create("warehouse") ? button("warehouse-new", "Create warehouse", "", "secondary") + button("location-new", "Create storage location", "", "secondary") : ""}${
      data.warehouses
        .map(
          (w) =>
            `<article class="card card-pad mt16"><div class="row wrap gap12"><div class="grow"><h3>${e(w.name)} · ${e(w.code)}</h3><p>${e([w.address?.line1, w.address?.line2, w.address?.city, w.address?.state_region, w.address?.postcode, w.address?.country_code].filter(Boolean).join(", "))}</p><p class="small muted">${e(w.kind || "warehouse")} · ${w.active ? "Active" : "Archived"}</p></div>${edit("warehouse") ? button("warehouse-edit", "Edit / archive", w.id) : ""}</div>${data.locations
              .filter((l) => l.warehouse_id === w.id)
              .map(
                (l) =>
                  `<div class="list-row"><div class="grow"><strong>${e(l.code)} · ${e(l.name)}</strong><p class="small muted">${l.parent_id ? e(locationName(l.parent_id)) : "Root location"} · ${l.active ? "Active" : "Archived"}</p></div>${edit("warehouse") ? button("location-edit", "Edit / archive", l.id) : ""}</div>`,
              )
              .join("")}</article>`,
        )
        .join("") ||
      '<div class="card empty mt16">No warehouses yet. Creating one adds a default storage location.</div>'
    }`;
  }
  function receiptsView() {
    if (!permission("purchasing", "view")) return "";
    if (!purchasing && !purchaseLoading && !purchaseError)
      void loadPurchasing();
    return `<section class="card card-pad mt16"><h3>Purchasing goods receipts</h3><p class="small muted">Receive ordered stock here. Manual stock adjustments are separate.</p>${button("receipts-refresh", "Refresh receipts")}${purchaseError ? `<p role="alert">${e(purchaseError)}</p>` : purchaseLoading ? '<p role="status">Loading receipts…</p>' : purchasing?.orders.map((po) => `<div class="list-row"><div class="grow"><strong>${e(po.po_number)}</strong><p>${e(warehouse(po.warehouse_id)?.name || "Warehouse unavailable")} · ${e(po.status)}</p></div>${edit() && permission("purchasing", "update") && permission("warehouse", "view") ? button("po", "Receive remaining quantities", po.id) : ""}</div>`).join("") || "<p>No outstanding purchase orders.</p>"}</section>`;
  }
  function messages() {
    return `${notice ? `<div class="form-note" role="status">${e(notice)}</div>` : ""}${error ? `<div class="login-error" role="alert">${e(error)}</div>` : ""}${recovery ? `<div class="form-note" role="status">An unconfirmed stock operation is saved for retry. Its original quantities and operation ID will be reused.${button("retry-operation", "Retry unconfirmed operation")}</div>` : ""}`;
  }
  function view(mode = "inventory") {
    if (["picking", "returns"].includes(mode)) {
      if (
        mode === "picking" &&
        manager() &&
        !permission("inventory", "view") &&
        permission("warehouse", "view") &&
        data
      )
        return `<section class="card card-pad"><h2>Warehouses and locations</h2>${messages()}${warehouseView()}</section>`;
      return "";
    }
    if (mode === "purchasing") return messages() + receiptsView();
    if (!data) {
      if (!error && !loading) void refresh();
      return `<section class="card card-pad"><h2>Warehouse inventory</h2>${error ? `<p role="alert">${e(error)}</p>${button("refresh", "Retry")}` : '<p role="status">Loading inventory…</p>'}</section>`;
    }
    return `${ctx.header("WAREHOUSE INVENTORY", "Products, locations and stock", "Manage the catalogue and stock at each warehouse location.", create() ? button("product-new", "Create product", "", "secondary") : "")}${messages()}<div class="card card-pad"><div class="row wrap gap8">${button("tab-stock", "Stock")}${permission("warehouse", "view") ? button("tab-warehouses", "Warehouses") : ""}${permission("purchasing", "view") ? button("tab-receipts", "Receipts") : ""}${button("refresh", "Refresh")}</div></div>${tab === "warehouses" ? warehouseView() : tab === "receipts" ? receiptsView() : stockView()}`;
  }
  function renderModal() {
    if (!modal || !data) return "";
    const { type, id } = modal,
      draft = modal.draft || {};
    let title = "Inventory",
      fields = "",
      save = true;
    if (type === "detail") {
      save = false;
      const v = variant(id),
        p = product(v?.product_id);
      if (!v || !p) return "";
      const row = inventoryRows(data).find((r) => r.variant.id === id);
      title = "Product details";
      fields = `<h3>${e(p.name)} · ${e(v.name)}</h3><p>${e(p.description || "")}</p><p>${e(v.sku)} · ${e(variationLabel(v))}</p><p>Cost ${ctx.money(v.cost_price ?? p.cost_price)} · Sale ${ctx.money(v.sale_price ?? p.sale_price)}</p><div class="row wrap gap8">${edit() ? button("product-edit", "Edit product", p.id) + button("images-product", "Product images", p.id) + button("images-variant", "Variant images", v.id) + button("barcode", "Register barcode", v.id) : ""}${create() ? button("variant-new", "Add variation", p.id) : ""}</div><h4 class="mt16">Per-location stock</h4>${row.balances.map((b) => `<p>${e(locationName(b.location_id))}: ${b.quantity_on_hand} on hand · ${b.quantity_reserved} reserved · ${b.quantity_available ?? Number(b.quantity_on_hand) - Number(b.quantity_reserved)} available · ${b.quantity_damaged || 0} damaged · ${ctx.money(b.stock_value ?? Number(b.quantity_on_hand) * (v.cost_price ?? p.cost_price))}</p>`).join("") || "<p>No stock posted for this variant.</p>"}<h4>Barcodes</h4>${
        data.barcodes
          .filter((b) => b.variant_id === id)
          .map(
            (b) => `<p>${e(b.barcode)}${b.is_primary ? " · Primary" : ""}</p>`,
          )
          .join("") || "<p>No registered barcodes.</p>"
      }<div class="row wrap gap8">${imageLinks(data, p.id, v.id)
        .map((image) => photo(image, p.name, 96))
        .join(
          "",
        )}</div><h4>Movement history</h4>${(modal.history || data.recent_movements.filter((m) => m.variant_id === id)).map((m) => `<div class="list-row"><div><strong>${e(m.movement_type)} · ${e(m.quantity)}</strong><p>${e(m.notes || "")} · ${e(m.created_at)}<br>${e(m.from_location_id ? locationName(m.from_location_id) : "External")} → ${e(m.to_location_id ? locationName(m.to_location_id) : "External")}</p></div></div>`).join("") || "<p>No movements yet.</p>"}${modal.moreHistory ? button("history", "Load older movements") : ""}`;
    } else if (/^(product|variant)-(new|edit)$/.test(type)) {
      const isVariant = type.startsWith("variant"),
        editing = type.endsWith("edit"),
        record = { ...(isVariant ? variant(id) : product(id)), ...draft };
      title = isVariant ? "Product variant" : "Product catalogue";
      fields =
        input("name", "Name", record.name) + input("sku", "SKU", record.sku);
      if (isVariant) {
        fields +=
          `<div class="field"><label for="inv-attributes">Variations / custom attributes</label><textarea class="textarea" name="attributes" id="inv-attributes">${e(
            typeof record.attributes === "string"
              ? record.attributes
              : Object.entries(record.attributes || {})
                  .map(([k, v]) => `${k}: ${v}`)
                  .join("\n"),
          )}</textarea><p class="small muted">One Attribute: Value per line.</p></div>` +
          input("brand", "Brand", record.brand) +
          select(
            "default_supplier_id",
            "Default supplier",
            options.suppliers.filter(
              (s) => s.active || s.id === record.default_supplier_id,
            ),
            record.default_supplier_id,
          ) +
          select(
            "default_location_id",
            "Default location",
            data.locations
              .filter(
                (l) =>
                  (l.active && warehouse(l.warehouse_id)?.active) ||
                  l.id === record.default_location_id,
              )
              .map((l) => ({ id: l.id, name: locationName(l.id) })),
            record.default_location_id,
          );
      } else {
        fields +=
          input("description", "Description", record.description) +
          select(
            "category_id",
            "Category",
            options.categories.filter(
              (c) => c.active || c.id === record.category_id,
            ),
            record.category_id,
          ) +
          input(
            "product_type",
            "Product type",
            record.product_type || "stock",
          ) +
          input("unit", "Unit of measure", record.unit || "each") +
          input("tax_rate", "Tax rate", record.tax_rate ?? 0, "number") +
          select(
            "track_inventory",
            "Track inventory",
            [
              { id: "true", name: "Yes" },
              { id: "false", name: "No" },
            ],
            String(record.track_inventory ?? true),
          );
      }
      fields +=
        input(
          "cost_price",
          isVariant ? "Cost override (blank inherits product)" : "Cost price",
          record.cost_price ?? "",
          "number",
        ) +
        input(
          "sale_price",
          isVariant
            ? "Sale override (blank inherits product)"
            : "Selling price",
          record.sale_price ?? "",
          "number",
        ) +
        status(record.active);
      if (!editing)
        fields += input(
          "barcode",
          "Barcode (optional)",
          draft.barcode ?? modal.barcode,
        );
      if (optionsError) fields += `<p role="alert">${e(optionsError)}</p>`;
      fields +=
        '<p class="small muted">Save the catalogue first, then use Add Stock for opening quantities. Product edits preserve variant names and explicit price overrides.</p>';
    } else if (type === "warehouse-new" || type === "warehouse-edit") {
      const w = { ...warehouse(id), ...draft },
        a = warehouse(id)?.address || {};
      title = "Warehouse";
      fields =
        input("name", "Warehouse name", w.name) +
        input("code", "Unique code", w.code) +
        select(
          "kind",
          "Kind",
          [
            { id: "warehouse", name: "Warehouse" },
            { id: "van", name: "Van" },
          ],
          w.kind || "warehouse",
        ) +
        status(w.active);
      if (id)
        fields += `<label><input type="checkbox" name="change_address" ${draft.change_address ? "checked" : ""}> Save a replacement address</label>`;
      for (const [key, label] of [
        ["line1", "Address line 1"],
        ["line2", "Address line 2"],
        ["city", "City"],
        ["state_region", "State / region"],
        ["postcode", "Postcode"],
        ["country_code", "Country code"],
        ["latitude", "Latitude (optional)"],
        ["longitude", "Longitude (optional)"],
      ])
        fields += input(
          key,
          label,
          draft[key] ?? a[key] ?? (key === "country_code" ? "AU" : ""),
          ["latitude", "longitude"].includes(key) ? "number" : "text",
        );
    } else if (type === "location-new" || type === "location-edit") {
      const l = { ...location(id), ...draft },
        wh = l.warehouse_id || filters.warehouse;
      title = "Storage location";
      fields =
        select(
          "warehouse_id",
          "Warehouse",
          data.warehouses.filter((w) => w.active || w.id === l.warehouse_id),
          wh,
        ) +
        input("code", "Location code", l.code) +
        input("name", "Location name", l.name) +
        select(
          "parent_id",
          "Parent location (optional)",
          data.locations
            .filter(
              (p) =>
                p.id !== id &&
                p.warehouse_id === wh &&
                (p.active || p.id === l.parent_id),
            )
            .map((p) => ({ id: p.id, name: locationName(p.id) })),
          l.parent_id,
        ) +
        status(l.active);
      if (id)
        fields +=
          '<p class="small muted">The warehouse of an existing location cannot be changed.</p>';
    } else if (type === "barcode") {
      title = "Register barcode";
      fields =
        input("barcode", "Barcode", draft.barcode) +
        `<label><input type="checkbox" name="is_primary" ${draft.is_primary ? "checked" : ""}> Make primary</label>`;
    } else if (type.startsWith("images-")) {
      title = "Image gallery";
      const v = type === "images-variant" ? variant(id) : null,
        pid = v?.product_id || id;
      const images = data.images.filter(
        (i) =>
          i.product_id === pid && (i.variant_id || null) === (v?.id || null),
      );
      fields = `<p>JPEG, PNG, WebP or AVIF, up to 10 MiB. Uploads use a new private object path.</p><div class="field"><label for="inventory-images">Image</label><input id="inventory-images" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/avif"></div>${input("alt_text", "Image description", draft.alt_text)}${input("sort_order", "Gallery order", draft.sort_order ?? 0, "number")}<label><input type="checkbox" name="is_primary" ${draft.is_primary ? "checked" : ""}> Make primary</label><p id="inventory-upload-progress" role="status">${modal.uploaded ? "Image uploaded. Retry saving its gallery link." : ""}</p><div class="row wrap gap8">${images.map((i) => `<div>${photo(i, "Product", 96)}<p>${e(i.alt_text || "")} · Order ${i.sort_order}${i.is_primary ? " · Primary" : ""}</p>${button("image-edit", "Edit image", i.id)}</div>`).join("")}</div>`;
    } else if (type === "image-edit") {
      const image = { ...data.images.find((i) => i.id === id), ...draft };
      title = "Edit image";
      fields =
        photo(image, "Product", 96) +
        input("alt_text", "Image description", image.alt_text) +
        input("sort_order", "Gallery order", image.sort_order, "number") +
        select(
          "is_primary",
          "Primary image",
          [
            { id: "true", name: "Yes" },
            { id: "false", name: "No" },
          ],
          String(image.is_primary),
        ) +
        status(image.active);
    } else if (type === "po") {
      title = "Receive purchase order";
      const po = purchasing?.orders.find((p) => p.id === id);
      fields =
        purchasing?.items
          .filter(
            (i) =>
              i.purchase_order_id === id &&
              Number(i.quantity_ordered) > Number(i.quantity_received),
          )
          .map(
            (i) =>
              `<fieldset><legend>${e(variant(i.variant_id)?.sku || i.sku_snapshot || i.variant_id)}</legend>${input(`qty_${i.id}`, "Quantity to receive", draft[`qty_${i.id}`] ?? Number(i.quantity_ordered) - Number(i.quantity_received), "number")}${select(
                `loc_${i.id}`,
                "Receiving location",
                activeLocations().filter(
                  (l) => location(l.id)?.warehouse_id === po.warehouse_id,
                ),
                draft[`loc_${i.id}`],
              )}</fieldset>`,
          )
          .join("") || "<p>No outstanding lines.</p>";
    } else {
      title = {
        receive: "Add Stock",
        adjust: "Stock adjustment",
        transfer: "Transfer stock",
      }[type];
      fields =
        `<h3>${e(variant(id)?.sku)} · ${e(variationLabel(variant(id)))}</h3>` +
        select(
          "location_id",
          "Warehouse / storage location",
          activeLocations(),
          draft.location_id || filters.location,
        ) +
        (type === "transfer"
          ? select(
              "destination_id",
              "Destination warehouse / location",
              activeLocations(),
              draft.destination_id,
            )
          : "") +
        input(
          "quantity",
          type === "adjust" ? "Signed quantity (+ / −)" : "Quantity",
          draft.quantity ?? 1,
          "number",
        ) +
        input("reason", "Reason", draft.reason) +
        '<p class="small muted">Review the locations and quantity. Use Purchasing for PO receipts and the existing job/return workflows for collections, returns and damaged goods.</p>';
    }
    return ctx.modalFrame(
      title,
      notice,
      `<form id="inventory-form"><div class="form-stack">${fields}</div></form>${error ? `<div role="alert" class="login-error">${e(error)}</div>` : ""}`,
      "",
      "inv-cancel",
      button("cancel", "Close") +
        (save
          ? button(
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
    const version = ++lookupVersion;
    scanCode = String(code || "").trim();
    matches = [];
    selected = "";
    unknown = false;
    if (!scanCode) {
      render();
      return;
    }
    try {
      const found = await backend.lookup(scanCode);
      if (lifecycle.disposed || version !== lookupVersion) return;
      matches = found;
      // The lookup is authoritative; refresh the catalogue before showing actions.
      await refresh(true);
      if (lifecycle.disposed || version !== lookupVersion) return;
      selected = found.length === 1 ? found[0].id : "";
      unknown = found.length === 0;
    } catch (failure) {
      if (version === lookupVersion) error = failure.message;
    }
    if (!lifecycle.disposed) render();
  }
  function authorize(type) {
    if (["receive", "adjust", "transfer", "retry-operation"].includes(type)) {
      if (!moveAllowed())
        throw new Error(
          "Inventory update and warehouse view permissions are required",
        );
    } else if (type === "po") {
      if (
        !edit() ||
        !permission("purchasing", "view") ||
        !permission("purchasing", "update") ||
        !permission("warehouse", "view")
      )
        throw new Error("Purchasing receipt permission required");
    } else {
      const module = /^(warehouse|location)-/.test(type)
        ? "warehouse"
        : "inventory";
      if (!edit(module) || (type.endsWith("-new") && !create(module)))
        throw new Error("Management permissions are required");
    }
  }
  async function save(current, form) {
    const fd = new FormData(form);
    const values = Object.fromEntries(
      [...fd.entries()].filter(([, v]) => typeof v === "string"),
    );
    current.draft = values;
    const { type, id } = current;
    authorize(type);
    const number = (key, nullable = false) => {
      if (nullable && values[key] === "") return null;
      const n = Number(values[key]);
      if (!Number.isFinite(n))
        throw new Error(`${key.replaceAll("_", " ")} must be finite`);
      return n;
    };
    if (/^(product|variant)-(new|edit)$/.test(type)) {
      const isVariant = type.startsWith("variant"),
        editing = type.endsWith("edit");
      const payload = {
        name: values.name.trim(),
        sku: values.sku.trim(),
        active: values.active === "true",
        cost_price: number("cost_price", isVariant),
        sale_price: number("sale_price", isVariant),
      };
      if (!payload.name || !payload.sku)
        throw new Error("Name and SKU are required");
      if (editing || current.savedId) payload.id = current.savedId || id;
      if (isVariant)
        Object.assign(payload, {
          product_id: current.productId || variant(id)?.product_id,
          attributes: attributes(values.attributes),
          brand: values.brand || null,
          default_supplier_id:
            values.default_supplier_id ||
            (options.suppliers.some(
              (s) => s.id === variant(id)?.default_supplier_id,
            )
              ? null
              : variant(id)?.default_supplier_id || null),
          default_location_id: values.default_location_id || null,
        });
      else
        Object.assign(payload, {
          description: values.description || null,
          category_id:
            values.category_id ||
            (options.categories.some((c) => c.id === product(id)?.category_id)
              ? null
              : product(id)?.category_id || null),
          product_type: values.product_type,
          unit: values.unit,
          tax_rate: number("tax_rate"),
          track_inventory: values.track_inventory === "true",
        });
      // Once creation succeeds all later retries patch its returned UUID.
      const saved = await (isVariant
        ? backend.saveVariant(payload)
        : backend.saveProduct(payload));
      current.savedId = saved.id;
      if (!editing)
        notice = `${isVariant ? "Variant" : "Product"} saved. Other steps can be retried without creating it again.`;
      if (values.barcode?.trim()) {
        let vid = saved.id;
        if (!isVariant) {
          const snapshot = await backend.load();
          vid = snapshot.variants.find(
            (v) => v.product_id === saved.id && v.sku === payload.sku,
          )?.id;
          if (!vid)
            throw new Error(
              "Product saved; default variant could not be loaded. Retry barcode registration.",
            );
        }
        await backend.saveBarcode(vid, values.barcode, true);
      }
    } else if (type.startsWith("warehouse-")) {
      const payload = {
        name: values.name.trim(),
        code: values.code.trim(),
        kind: values.kind,
        active: values.active === "true",
      };
      if (id || current.savedId) payload.id = current.savedId || id;
      if ((!id && values.line1.trim()) || values.change_address) {
        const latitude = number("latitude", true),
          longitude = number("longitude", true);
        if (!values.line1.trim()) throw new Error("Address line 1 is required");
        if (
          (latitude === null) !== (longitude === null) ||
          (latitude !== null &&
            (Math.abs(latitude) > 90 || Math.abs(longitude) > 180))
        )
          throw new Error("Supply both coordinates within geographic bounds");
        payload.address = Object.fromEntries(
          [
            "line1",
            "line2",
            "city",
            "state_region",
            "postcode",
            "country_code",
          ].map((k) => [k, values[k] || (k === "country_code" ? "AU" : null)]),
        );
        Object.assign(payload.address, { latitude, longitude });
      }
      const result = await backend.saveWarehouse(payload);
      current.savedId = result.id;
    } else if (type.startsWith("location-")) {
      if (id && values.warehouse_id !== location(id)?.warehouse_id)
        throw new Error("An existing location cannot change warehouse");
      const payload = {
        warehouse_id: values.warehouse_id,
        parent_id: values.parent_id || null,
        name: values.name,
        code: values.code.trim(),
        active: values.active === "true",
      };
      if (id || current.savedId) payload.id = current.savedId || id;
      if (
        payload.parent_id &&
        location(payload.parent_id)?.warehouse_id !== payload.warehouse_id
      )
        throw new Error("Parent must belong to the same warehouse");
      const result = await backend.saveLocation(payload);
      current.savedId = result.id;
    } else if (type === "barcode") {
      if (!values.barcode.trim()) throw new Error("Enter a barcode");
      await backend.saveBarcode(id, values.barcode, values.is_primary === "on");
    } else if (type.startsWith("images-")) {
      const file = fd.get("image"),
        v = type === "images-variant" ? variant(id) : null;
      if (!current.uploaded) {
        if (!(file instanceof File) || !file.size)
          throw new Error("Choose an image");
        validateImage(file);
        current.uploaded = await backend.upload(file, (percent) => {
          const el = ctx.$("#inventory-upload-progress");
          if (el)
            el.textContent =
              percent === 100
                ? "Upload complete. Saving gallery link…"
                : "Uploading image…";
        });
      }
      if (!Number.isInteger(number("sort_order")))
        throw new Error("Gallery order must be an integer");
      // If the prior link response was lost, find its immutable path before retrying.
      const fresh = await backend.load(access());
      const existing = fresh.images.find(
        (i) => i.object_path === current.uploaded,
      );
      const payload = existing
        ? {
            id: existing.id,
            alt_text: values.alt_text,
            sort_order: number("sort_order"),
            is_primary: values.is_primary === "on",
          }
        : {
            product_id: v?.product_id || id,
            variant_id: v?.id || null,
            object_path: current.uploaded,
            alt_text: values.alt_text,
            sort_order: number("sort_order"),
            is_primary: values.is_primary === "on",
          };
      await backend.saveImage(payload);
    } else if (type === "image-edit") {
      if (!Number.isInteger(number("sort_order")))
        throw new Error("Gallery order must be an integer");
      await backend.saveImage({
        id,
        alt_text: values.alt_text,
        sort_order: number("sort_order"),
        is_primary: values.is_primary === "true",
        active: values.active === "true",
      });
    } else if (type === "po") {
      if (recovery) throw new Error("Retry the unconfirmed operation first");
      const po = purchasing.orders.find((p) => p.id === id);
      const lines = purchasing.items
        .filter(
          (i) =>
            i.purchase_order_id === id && Number(values[`qty_${i.id}`]) > 0,
        )
        .map((i) => {
          const quantity = number(`qty_${i.id}`),
            loc = location(values[`loc_${i.id}`]);
          if (
            !Number.isInteger(quantity) ||
            quantity >
              Number(i.quantity_ordered) - Number(i.quantity_received) ||
            !loc?.active ||
            loc.warehouse_id !== po.warehouse_id
          )
            throw new Error(
              "Choose a valid receiving location and an outstanding whole quantity",
            );
          return {
            purchase_order_item_id: i.id,
            quantity,
            location_id: loc.id,
          };
        });
      if (!lines.length) throw new Error("Enter at least one receipt quantity");
      await post({ kind: "po", id, lines, key: crypto.randomUUID() });
      await loadPurchasing();
    } else {
      if (recovery) throw new Error("Retry the unconfirmed operation first");
      const quantity = number("quantity"),
        loc = location(values.location_id),
        dest = location(values.destination_id);
      if (!loc?.active || !warehouse(loc.warehouse_id)?.active)
        throw new Error("Choose an active stock location");
      if (
        type === "transfer" &&
        (!dest?.active || !warehouse(dest.warehouse_id)?.active)
      )
        throw new Error("Choose an active destination");
      const args = stockMoveArgs({
        eventId: crypto.randomUUID(),
        variantId: id,
        quantity: type === "adjust" ? Math.abs(quantity) : quantity,
        reason: values.reason,
        source:
          type === "transfer" || (type === "adjust" && quantity < 0)
            ? loc
            : null,
        destination:
          type === "transfer"
            ? dest
            : type === "receive" || quantity > 0
              ? loc
              : null,
      });
      await post({ kind: "stock", args });
    }
  }
  async function handle(el) {
    const name = el.dataset.action;
    if (!name?.startsWith("inv-")) return false;
    if (busy) return true;
    const type = name.slice(4),
      id = el.dataset.id;
    if (type === "cancel") {
      modal = null;
      error = "";
      scanner.stop();
      render();
      return true;
    }
    if (type === "refresh") {
      await loadOptions();
      await refresh();
      return true;
    }
    if (type === "receipts-refresh") {
      await loadPurchasing();
      return true;
    }
    if (!data) return true;
    if (type.startsWith("tab-")) {
      tab = type.slice(4);
      scanner.stop();
      if (tab === "warehouses") await refresh();
      if (tab === "receipts") await loadPurchasing();
      render();
      return true;
    }
    if (type === "scan-choice") {
      if (matches.some((v) => v.id === id)) selected = id;
      render();
      return true;
    }
    if (type === "stop-camera") {
      scanner.stop();
      return true;
    }
    if (type === "camera") {
      try {
        await scanner.start(
          ctx.$("#inventory-camera"),
          (code) => void lookup(code),
          (f) => {
            error = f.message;
            render();
          },
        );
      } catch (f) {
        error = f.message;
        render();
      }
      return true;
    }
    if (type === "history" && modal?.type === "detail") {
      busy = true;
      try {
        const page = await backend.history(
          modal.id,
          modal.history?.length || 0,
        );
        modal.history = [...(modal.history || []), ...page];
        modal.moreHistory = page.length === 100;
      } catch (f) {
        error = f.message;
      } finally {
        busy = false;
        render();
      }
      return true;
    }
    if (type === "retry-operation") {
      busy = true;
      error = "";
      render();
      try {
        if (!recovery) return true;
        authorize(recovery.kind === "po" ? "po" : type);
        await post(recovery);
        notice = "Stock operation confirmed.";
        modal = null;
        await refresh(true);
        if (purchasing) await loadPurchasing();
      } catch (f) {
        error = f.message;
      } finally {
        busy = false;
        render();
      }
      return true;
    }
    if (type === "save") {
      const form = ctx.$("#inventory-form");
      if (!modal || !form) return true;
      busy = true;
      error = "";
      scanner.stop();
      ctx.$$('button[data-action^="inv-"]').forEach((b) => {
        b.disabled = true;
      });
      const current = modal;
      try {
        await save(current, form);
        modal = null;
        notice = "Change confirmed by the backend.";
        await refresh(true);
      } catch (f) {
        if (current.savedId) await refresh(true);
        error = `${current.savedId ? "Catalogue record saved. " : ""}${f.message}`;
      } finally {
        busy = false;
        if (!lifecycle.disposed) render();
      }
      return true;
    }
    const supported = [
      "detail",
      "product-new",
      "product-edit",
      "variant-new",
      "variant-edit",
      "warehouse-new",
      "warehouse-edit",
      "location-new",
      "location-edit",
      "barcode",
      "images-product",
      "images-variant",
      "image-edit",
      "receive",
      "adjust",
      "transfer",
      "po",
      "unknown-product",
      "unknown-variant",
    ];
    if (!supported.includes(type)) {
      error =
        "This existing workflow requires its separate backend integration. No stock was posted.";
      render();
      return true;
    }
    try {
      if (type !== "detail")
        authorize(type.startsWith("unknown") ? "product-new" : type);
      scanner.stop();
      notice = "";
      error = "";
      if (type === "unknown-product")
        modal = { type: "product-new", barcode: scanCode };
      else if (type === "unknown-variant") {
        const pid = ctx.$("#inv-unknown_product")?.value;
        if (!pid) throw new Error("Choose an active product");
        modal = { type: "variant-new", productId: pid, barcode: scanCode };
      } else
        modal = {
          type,
          id,
          ...(type === "variant-new" ? { productId: id } : {}),
        };
      if (type === "detail") {
        const opened = modal;
        void backend
          .history(id, 0)
          .then((history) => {
            if (modal !== opened || lifecycle.disposed) return;
            opened.history = history;
            opened.moreHistory = history.length === 100;
            render();
          })
          .catch((f) => {
            if (modal === opened && !lifecycle.disposed) {
              error = f.message;
              render();
            }
          });
      }
    } catch (f) {
      error = f.message;
    }
    render();
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
      if (!signing.has(path))
        signing.set(
          path,
          backend
            .imageURL(path)
            .then((url) => {
              urls.set(path, { url, until: Date.now() + 240000 });
              return url;
            })
            .finally(() => signing.delete(path)),
        );
      void signing
        .get(path)
        .then((url) => {
          if (!lifecycle.disposed && img.isConnected) img.src = url;
        })
        .catch((f) => {
          if (img.isConnected) {
            img.alt = `Image unavailable: ${f.message}`;
            img.title = f.message;
          }
        });
    }
  }
  lifecycle.listen(
    ctx.root,
    "submit",
    (event) => {
      if (!["inventory-scan", "inventory-form"].includes(event.target.id))
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (busy) return;
      if (event.target.id === "inventory-scan")
        void lookup(new FormData(event.target).get("code"));
      else void handle({ dataset: { action: "inv-save" } });
    },
    { capture: true },
  );
  lifecycle.listen(ctx.root, "input", (event) => {
    if (event.target.dataset.inventoryFilter === "search") {
      filters.search = event.target.value;
      render();
    }
  });
  lifecycle.listen(ctx.root, "change", (event) => {
    const filter = event.target.dataset.inventoryFilter;
    if (filter && filter !== "search") {
      filters[filter] = event.target.value;
      if (filter === "warehouse") filters.location = "";
      render();
    } else if (
      event.target.name === "warehouse_id" &&
      modal?.type === "location-new"
    ) {
      modal.draft = Object.fromEntries(new FormData(ctx.$("#inventory-form")));
      modal.draft.parent_id = "";
      render();
    }
  });
  lifecycle.listen(window, "focus", () => {
    if (!busy) {
      void refresh();
      if (purchasing) void loadPurchasing();
      hydrateImages();
    }
  });
  lifecycle.listen(window, "online", () => {
    if (!busy) {
      void refresh();
      if (purchasing) void loadPurchasing();
    }
  });
  lifecycle.setInterval(() => {
    if (!busy) {
      void refresh();
      hydrateImages();
    }
  }, 30000);
  void loadOptions();
  return {
    view,
    renderModal,
    handle,
    refresh,
    hydrateImages,
    stopCamera: scanner.stop,
    dispose: scanner.stop,
    get data() {
      return data;
    },
  };
}
