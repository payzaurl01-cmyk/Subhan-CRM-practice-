import {
  EMPTY_INVENTORY,
  normalizeInventory,
  validateImage,
} from "./inventory-model.js";

export function createInventoryBackend(client) {
  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error)
      throw Object.assign(new Error(error.message), { code: error.code });
    if (data == null) throw new Error("The backend did not confirm completion");
    return data;
  }
  const save = async (kind, payload) => {
    const row = await rpc(`inventory_save_${kind}`, { [`p_${kind}`]: payload });
    if (!row || Array.isArray(row) || typeof row.id !== "string" || !row.id)
      throw new Error("The backend did not return the saved record");
    return row;
  };
  return {
    async load(context) {
      if (
        context &&
        !context.modules.some((m) => m.key === "inventory" && m.can_view) &&
        context.modules.some((m) => m.key === "warehouse" && m.can_view)
      ) {
        const wh = await rpc("warehouse_snapshot");
        return {
          ...EMPTY_INVENTORY,
          ...wh,
          summary: {
            ...EMPTY_INVENTORY.summary,
            warehouse_count: wh.warehouses.length,
          },
        };
      }
      return normalizeInventory(await rpc("inventory_snapshot"));
    },
    async options(includeSuppliers = false) {
      const queries = [
        client.from("product_categories").select("id,name,active"),
      ];
      if (includeSuppliers)
        queries.push(client.from("suppliers").select("id,name,active"));
      const results = await Promise.all(queries);
      for (const result of results)
        if (result.error) throw new Error(result.error.message);
      return {
        categories: results[0].data || [],
        suppliers: results[1]?.data || [],
      };
    },
    async warehouses() {
      const result = await rpc("warehouse_snapshot");
      if (
        result.schema_version !== 1 ||
        !Array.isArray(result.warehouses) ||
        !Array.isArray(result.locations)
      )
        throw new Error("Invalid warehouse snapshot response");
      return result;
    },
    saveProduct: (payload) => save("product", payload),
    saveVariant: (payload) => save("variant", payload),
    saveWarehouse: (payload) => save("warehouse", payload),
    saveLocation: (payload) => save("location", payload),
    saveImage: (payload) => save("image", payload),
    saveBarcode: (variantId, code, primary = false) =>
      rpc("inventory_save_barcode", {
        p_variant_id: variantId,
        p_barcode: code.trim(),
        p_is_primary: primary,
      }),
    lookup: async (code) => {
      const result = await rpc("inventory_lookup_barcode", {
        p_code: String(code).trim(),
      });
      if (!Array.isArray(result.matches))
        throw new Error("Invalid barcode response");
      return result.matches;
    },
    async move(args) {
      const id = await rpc("inventory_move_stock", args);
      if (typeof id !== "string" || !id)
        throw new Error("The backend did not return a movement ID");
      return id;
    },
    async purchasing() {
      const results = await Promise.all([
        client
          .from("purchase_orders")
          .select("*")
          .in("status", ["ordered", "part_received"]),
        client.from("purchase_order_items").select("*"),
      ]);
      for (const result of results)
        if (result.error) throw new Error(result.error.message);
      return { orders: results[0].data || [], items: results[1].data || [] };
    },
    async history(variantId, offset = 0) {
      const { data, error } = await client
        .from("stock_movements")
        .select("*")
        .eq("variant_id", variantId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + 99);
      if (error)
        throw Object.assign(new Error(error.message), { code: error.code });
      return data || [];
    },
    receivePO: (id, lines, key) =>
      rpc("crm_receive_po", { p_po_id: id, p_lines: lines, p_key: key }),
    async upload(file, progress = () => {}) {
      validateImage(file);
      const { data, error } = await client.auth.getUser();
      if (error)
        throw Object.assign(new Error(error.message), { code: error.code });
      if (!data?.user || data.user.is_anonymous)
        throw new Error("Sign in before uploading images");
      const extension = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/avif": "avif",
      }[file.type];
      const path = `${data.user.id}/${crypto.randomUUID()}.${extension}`;
      progress(0);
      const uploaded = await client.storage
        .from("inventory-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploaded.error) throw new Error(uploaded.error.message);
      progress(100);
      return path;
    },
    async imageURL(path) {
      const { data, error } = await client.storage
        .from("inventory-images")
        .createSignedUrl(path, 300);
      if (error)
        throw Object.assign(new Error(error.message), { code: error.code });
      if (!data?.signedUrl) throw new Error("Image URL was not returned");
      return data.signedUrl;
    },
  };
}
