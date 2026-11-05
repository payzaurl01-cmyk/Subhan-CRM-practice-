import { imageLinks, inventoryRows, variationLabel } from "./inventory-model.js";

export function renderInventoryStock({
  data,
  filters,
  sort,
  layout,
  ctx,
  e,
  photo,
  stockActions,
  scanView,
  locationName,
}) {
  const warehouses = data.warehouses.filter((warehouse) => warehouse.active);
  const baseRows = inventoryRows(data, {
    warehouse: filters.warehouse,
    location: filters.location,
    search: filters.search,
    category: filters.category,
  }).filter(
    (row) =>
      filters.archived === "all" ||
      (filters.archived === "archived"
        ? !row.product.active || !row.variant.active
        : row.product.active && row.variant.active),
  );
  const counts = {
    all: baseRows.length,
    low: baseRows.filter((row) => row.status === "low").length,
    out: baseRows.filter((row) => row.status === "out").length,
  };
  const rows = baseRows
    .filter((row) => !filters.stock || row.status === filters.stock)
    .sort((left, right) => {
      if (sort === "name")
        return left.product.name.localeCompare(right.product.name);
      if (sort === "sku") return left.variant.sku.localeCompare(right.variant.sku);
      if (sort === "available-asc") return left.available - right.available;
      if (sort === "available-desc") return right.available - left.available;
      return (
        String(right.variant.created_at || right.product.created_at || "").localeCompare(
          String(left.variant.created_at || left.product.created_at || ""),
        ) || left.product.name.localeCompare(right.product.name)
      );
    });
  const scopedRows = inventoryRows(data, { warehouse: filters.warehouse });
  const scopedBalances = scopedRows.flatMap((row) => row.balances);
  const summary = filters.warehouse
    ? {
        stock_value: scopedRows.reduce(
          (sum, row) =>
            sum +
            row.balances.reduce(
              (value, balance) =>
                value +
                Number(
                  balance.stock_value ??
                    Number(balance.quantity_on_hand) *
                      Number(row.variant.cost_price ?? row.product.cost_price ?? 0),
                ),
              0,
            ),
          0,
        ),
        on_hand: scopedBalances.reduce(
          (sum, balance) => sum + Number(balance.quantity_on_hand),
          0,
        ),
        reserved: scopedBalances.reduce(
          (sum, balance) => sum + Number(balance.quantity_reserved),
          0,
        ),
        available: scopedRows.reduce((sum, row) => sum + row.available, 0),
        low_stock_variants: scopedRows.filter((row) => row.status !== "in").length,
      }
    : data.summary;
  const categoryName = (row) =>
    data.categories.find((category) => category.id === row.product.category_id)
      ?.name || "Uncategorised";
  const choices = (name, label, values, value) =>
    `<label class="sr-only" for="inventory-${name}">${e(label)}</label><select class="select" id="inventory-${name}" data-inventory-filter="${name}" aria-label="${e(label)}"><option value="">${e(label)}</option>${values.map((item) => `<option value="${e(item.id)}" ${String(item.id) === String(value) ? "selected" : ""}>${e(item.name)}</option>`).join("")}</select>`;
  const warehouseCards = [
    `<button type="button" class="inventory-warehouse-card ${!filters.warehouse ? "is-active" : ""}" data-action="inv-warehouse-select" data-id="" aria-pressed="${!filters.warehouse}"><span class="icon-box">${ctx.icon("box", "sm")}</span><span><strong>All warehouses</strong><small>Across all locations</small></span></button>`,
    ...warehouses.map(
      (warehouse) =>
        `<button type="button" class="inventory-warehouse-card ${filters.warehouse === warehouse.id ? "is-active" : ""}" data-action="inv-warehouse-select" data-id="${e(warehouse.id)}" aria-pressed="${filters.warehouse === warehouse.id}"><span class="icon-box">${ctx.icon("box", "sm")}</span><span><strong>${e(warehouse.name)}</strong><small>${e([warehouse.address?.city, warehouse.address?.state_region].filter(Boolean).join(", ") || warehouse.code || "Warehouse")}</small></span></button>`,
    ),
  ].join("");
  const metric = (label, value, note, tone = "") =>
    `<div class="inventory-summary-item"><span>${e(label)}</span><strong class="${tone}">${value}</strong><small>${e(note)}</small></div>`;
  const status = (row) =>
    !row.product.active || !row.variant.active
      ? "Archived"
      : row.status === "out"
        ? "Out of stock"
        : row.status === "low"
          ? "Low stock"
          : "In stock";
  const supplierNames = (row) => {
    const ids = new Set([
      row.variant.default_supplier_id,
      row.product.metadata?.supplier_id,
      row.product.supplierId,
    ].filter(Boolean));
    for (const item of data.purchase_items || []) {
      if (item.variant_id !== row.variant.id) continue;
      const order = (data.purchase_orders || []).find((po) => po.id === item.purchase_order_id);
      if (order?.supplier_id) ids.add(order.supplier_id);
    }
    for (const order of ctx.state?.purchaseOrders || []) {
      for (const line of order.items || []) {
        if (line.productId !== row.product.id && line.sku !== row.variant.sku) continue;
        if (line.skuSupplierId) ids.add(line.skuSupplierId);
        else if (order.supplierId) ids.add(order.supplierId);
      }
    }
    return [...ids].map((id) => data.suppliers.find((supplier) => supplier.id === id)?.name || ctx.supplierDirectory?.().find((supplier) => supplier.id === id)?.name || ctx.state?.suppliers?.find((supplier) => supplier.id === id)?.name).filter(Boolean);
  };
  const productCell = (row) =>
    `<div class="inventory-product-cell">${photo(imageLinks(data, row.product.id, row.variant.id)[0], row.variant.name, 46)}<div><strong>${e(row.product.name)}</strong><small>${e(row.variant.name)}</small></div></div>`;
  const tableRows = rows
    .map(
      (row) =>
        `<tr><td>${productCell(row)}</td><td class="inventory-sku">${e(row.variant.sku)}</td><td>${e(variationLabel(row.variant))}</td><td>${e(categoryName(row))}</td><td>${e(supplierNames(row).join(", ") || "Not assigned")}</td><td>${ctx.money(row.variant.cost_price ?? row.product.cost_price ?? 0)}</td><td>${ctx.money(row.variant.sale_price ?? row.product.sale_price ?? 0)}</td><td><strong>${row.available}</strong><small class="inventory-cell-note">${row.reserved} reserved · ${row.onHand} on hand</small></td><td>${ctx.badge(status(row))}</td><td class="inventory-action-cell">${stockActions(row.variant)}</td></tr>`,
    )
    .join("");
  const gridRows = rows
    .map(
      (row) =>
        `<article class="inventory-grid-item"><div class="row gap12">${photo(imageLinks(data, row.product.id, row.variant.id)[0], row.variant.name, 56)}<div class="grow"><strong>${e(row.product.name)}</strong><small class="inventory-cell-note">${e(row.variant.name)} · ${e(row.variant.sku)}</small></div></div><p>${e(categoryName(row))} · ${e(variationLabel(row.variant))}</p><p>Supplier: ${e(supplierNames(row).join(", ") || "Not assigned")}</p><div class="row wrap gap8"><strong>${row.available} available</strong>${ctx.badge(status(row))}</div><p>Cost ${ctx.money(row.variant.cost_price ?? row.product.cost_price ?? 0)} · Sale ${ctx.money(row.variant.sale_price ?? row.product.sale_price ?? 0)}</p>${stockActions(row.variant)}</article>`,
    )
    .join("");
  const movements = (data.recent_movements || [])
    .filter(
      (movement) =>
        !filters.warehouse ||
        movement.from_warehouse_id === filters.warehouse ||
        movement.to_warehouse_id === filters.warehouse,
    )
    .slice(0, 3);
  const activity = movements
    .map((movement) => {
      const variant = data.variants.find((item) => item.id === movement.variant_id);
      const product = data.products.find((item) => item.id === variant?.product_id);
      const location = movement.to_location_id || movement.from_location_id;
      return `<div class="inventory-activity-row"><strong>${e(movement.movement_type || "Stock movement")} · ${e(product?.name || variant?.sku || "Product")} · ${e(String(movement.quantity ?? ""))} units</strong><small>${e(location ? locationName(location) : "Inventory")} · ${e(ctx.fmt(movement.created_at, true))}</small></div>`;
    })
    .join("");
  return `<div class="inventory-stock">
    <div class="inventory-section-label"><span>Warehouses</span><span>${warehouses.length} warehouses</span></div>
    <div class="inventory-warehouse-grid">${warehouseCards}</div>
    <section class="card inventory-summary" aria-label="Stock summary">${metric("Stock value", ctx.money(summary.stock_value), "at cost")}${metric("On hand", e(String(summary.on_hand)), "units")}${metric("Available", e(String(summary.available)), `${summary.reserved} reserved`)}${metric("Needs attention", e(String(summary.low_stock_variants)), "low / out of stock", "inventory-attention")}</section>
    <section class="card inventory-listing">
      <div class="inventory-list-tabs" role="group" aria-label="Stock status">${[["", "All products", counts.all], ["low", "Low stock", counts.low], ["out", "Out of stock", counts.out]].map(([value, label, count]) => `<button type="button" class="inventory-list-tab ${filters.stock === value ? "is-active" : ""}" data-action="inv-stock-filter" data-id="${value}" aria-pressed="${filters.stock === value}">${label} <span>${count}</span></button>`).join("")}<div class="inventory-layout-actions"><button type="button" class="btn ghost sm ${layout === "list" ? "is-active" : ""}" data-action="inv-layout-list" aria-pressed="${layout === "list"}">List</button><button type="button" class="btn ghost sm ${layout === "grid" ? "is-active" : ""}" data-action="inv-layout-grid" aria-pressed="${layout === "grid"}">Grid</button></div></div>
      <div class="inventory-list-toolbar"><div class="inventory-search"><label class="sr-only" for="inventory-list-search">Search products</label><span>${ctx.icon("search", "sm")}</span><input id="inventory-list-search" class="input" data-inventory-filter="search" data-focus="inventory-search" value="${e(filters.search)}" placeholder="Search product name, SKU or barcode"><button type="button" class="btn ghost sm" data-action="inv-scan-toggle" aria-label="Scan barcode" title="Scan barcode">${ctx.icon("scan", "sm")}</button></div>${choices("category", "All categories", data.categories, filters.category)}<label class="sr-only" for="inventory-sort">Sort products</label><select class="select" id="inventory-sort" data-inventory-sort aria-label="Sort products"><option value="recent" ${sort === "recent" ? "selected" : ""}>Recently added</option><option value="name" ${sort === "name" ? "selected" : ""}>Name A–Z</option><option value="sku" ${sort === "sku" ? "selected" : ""}>SKU</option><option value="available-asc" ${sort === "available-asc" ? "selected" : ""}>Available: low to high</option><option value="available-desc" ${sort === "available-desc" ? "selected" : ""}>Available: high to low</option></select></div>
      <div class="inventory-extra-filters">${choices("location", "All locations", data.locations.filter((item) => item.active && (!filters.warehouse || item.warehouse_id === filters.warehouse)).map((item) => ({ id: item.id, name: locationName(item.id) })), filters.location)}${choices("archived", "Active products", [{ id: "all", name: "Include archived" }, { id: "archived", name: "Archived only" }], filters.archived)}</div>
       ${rows.length ? layout === "grid" ? `<div class="inventory-product-grid">${gridRows}</div>` : `<div class="inventory-table-scroll"><table class="data-table inventory-table"><thead><tr><th>Product</th><th>SKU</th><th>Colour / size</th><th>Category</th><th>Supplier</th><th>Cost</th><th>Selling price</th><th>Available</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${tableRows}</tbody></table></div>` : '<div class="empty">No products match these filters.</div>'}
      <div class="inventory-list-footer"><span>${rows.length} of ${baseRows.length} variants${filters.warehouse ? ` · ${e(warehouses.find((item) => item.id === filters.warehouse)?.name || "Warehouse")}` : ""}</span><span>Prices in AUD · Available = on hand − reserved</span></div>
    </section>
    <p class="inventory-stock-note">Stock is tracked separately at every warehouse.</p>
    <section class="card inventory-activity"><h3>Recent stock activity</h3>${activity || '<p class="small muted">No recent stock movements.</p>'}</section>
    <div class="inventory-scan-area">${scanView()}</div>
  </div>`;
}
