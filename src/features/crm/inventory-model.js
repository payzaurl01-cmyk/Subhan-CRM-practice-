export const EMPTY_INVENTORY = Object.freeze({
  schema_version: 1,
  summary: {
    stock_value: 0,
    on_hand: 0,
    reserved: 0,
    available: 0,
    low_stock_variants: 0,
    product_count: 0,
    warehouse_count: 0,
  },
  images: [],
  recent_movements: [],
  products: [],
  variants: [],
  barcodes: [],
  warehouses: [],
  locations: [],
  balances: [],
  movements: [],
  categories: [],
  suppliers: [],
  job_items: [],
  return_items: [],
  purchase_orders: [],
  purchase_items: [],
  review: [],
  unassigned_balances: [],
  allocations: [],
  collectors: [],
  legacy_job_items: [],
});
export const IMAGE_LIMIT = 10 * 1024 * 1024;
export function attributes(value) {
  const pairs = String(value || "")
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  const result = Object.create(null);
  for (const pair of pairs) {
    const index = pair.indexOf(":");
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (
      index < 1 ||
      !value ||
      Object.keys(result).some(
        (item) => item.toLowerCase() === key.toLowerCase(),
      )
    )
      throw new Error("Use unique Attribute: Value pairs, one per line");
    result[key] = value;
  }
  return Object.fromEntries(Object.entries(result));
}
export const variationLabel = (variant) =>
  Object.entries(variant?.attributes || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ") || "Default variant";
export function findVariant(data, code) {
  const match = String(code || "")
    .trim()
    .toLowerCase();
  if (!match) return null;
  const ids = new Set(
    data.barcodes
      .filter((barcode) => barcode.barcode.toLowerCase() === match)
      .map((barcode) => barcode.variant_id),
  );
  for (const variant of data.variants)
    if (variant.sku.toLowerCase() === match) ids.add(variant.id);
  if (ids.size > 1)
    throw new Error("Conflicting identifiers require administrator review");
  return data.variants.find((variant) => ids.has(variant.id)) || null;
}
export function inventoryRows(data, filter = {}) {
  return data.variants
    .map((variant) => {
      const product = data.products.find(
        (product) => product.id === variant.product_id,
      );
      const all = data.balances.filter(
        (balance) => balance.variant_id === variant.id,
      );
      const balances = all.filter(
        (balance) =>
          (!filter.warehouse || balance.warehouse_id === filter.warehouse) &&
          (!filter.location || balance.location_id === filter.location),
      );
      const onHand = balances.reduce(
        (sum, balance) => sum + Number(balance.quantity_on_hand),
        0,
      );
      const reserved = balances.reduce(
        (sum, balance) => sum + Number(balance.quantity_reserved),
        0,
      );
      const threshold = balances.reduce(
        (sum, balance) => sum + Number(balance.reorder_level),
        0,
      );
      const available = onHand - reserved;
      return {
        variant,
        product,
        balances,
        onHand,
        reserved,
        available,
        threshold,
        status:
          available <= 0
            ? "out"
            : balances.some(
                  (b) =>
                    b.low_stock ??
                    (Number(b.quantity_on_hand) - Number(b.quantity_reserved) <
                      3 ||
                      Number(b.quantity_on_hand) -
                        Number(b.quantity_reserved) <=
                        Number(b.reorder_level)),
                )
              ? "low"
              : "in",
        images: imageLinks(data, product?.id, variant.id).map(
          (image) => image.object_path,
        ),
        damaged: balances.reduce(
          (sum, balance) => sum + Number(balance.quantity_damaged || 0),
          0,
        ),
      };
    })
    .filter(
      (row) =>
        row.product &&
        (!filter.variant || row.variant.id === filter.variant) &&
        (!filter.category || row.product.category_id === filter.category) &&
        (!filter.stock || row.status === filter.stock) &&
        (!(filter.warehouse || filter.location) || row.balances.length > 0) &&
        `${row.product.name} ${row.variant.name} ${row.variant.sku} ${variationLabel(row.variant)} ${data.barcodes
          .filter((barcode) => barcode.variant_id === row.variant.id)
          .map((barcode) => barcode.barcode)
          .join(" ")}`
          .toLowerCase()
          .includes(String(filter.search || "").toLowerCase()),
    );
}
export function validateImage(file) {
  if (
    !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)
  )
    throw new Error("Choose a JPEG, PNG, WebP or AVIF image");
  if (file.size <= 0 || file.size > IMAGE_LIMIT)
    throw new Error("Images must be between 1 byte and 10 MiB");
}

export function normalizeInventory(value) {
  if (
    !value ||
    Array.isArray(value) ||
    value.schema_version !== 1 ||
    !value.summary
  )
    throw new Error("Unsupported inventory snapshot response");
  for (const key of [
    "products",
    "variants",
    "barcodes",
    "warehouses",
    "locations",
    "images",
    "balances",
    "recent_movements",
  ])
    if (!Array.isArray(value[key]))
      throw new Error(`Invalid inventory snapshot: ${key}`);
  return { ...EMPTY_INVENTORY, ...value, movements: value.recent_movements };
}
export function imageLinks(data, productId, variantId) {
  const links = (data.images || []).filter(
    (image) => image.active !== false && image.product_id === productId,
  );
  const specific = variantId
    ? links.filter((image) => image.variant_id === variantId)
    : [];
  return (
    specific.length ? specific : links.filter((image) => !image.variant_id)
  ).sort(
    (a, b) =>
      Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) ||
      a.sort_order - b.sort_order ||
      a.id.localeCompare(b.id),
  );
}
export function stockMoveArgs({
  eventId,
  variantId,
  quantity,
  reason,
  source,
  destination,
}) {
  if (!Number.isFinite(quantity) || quantity <= 0)
    throw new Error("Quantity must be a positive finite number");
  if (!reason?.trim()) throw new Error("Enter a reason");
  if (!source && !destination) throw new Error("Choose a stock location");
  if (source && destination && source.id === destination.id)
    throw new Error("Choose a different destination");
  return {
    p_event_id: eventId,
    p_variant_id: variantId,
    p_quantity: quantity,
    p_reason: reason.trim(),
    p_from_warehouse_id: source?.warehouse_id || null,
    p_from_location_id: source?.id || null,
    p_to_warehouse_id: destination?.warehouse_id || null,
    p_to_location_id: destination?.id || null,
  };
}
