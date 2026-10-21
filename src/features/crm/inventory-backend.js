import { validateImage } from "./inventory-model.js";

export function createInventoryBackend(client) {
  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    if (!data || typeof data !== "object")
      throw new Error("The backend did not confirm completion");
    return data;
  }
  return {
    load: () => rpc("inventory_snapshot"),
    async history(variantId, offset = 0) {
      const { data, error } = await client
        .from("stock_movements")
        .select("*")
        .eq("variant_id", variantId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + 99);
      if (error) throw new Error(error.message);
      return data || [];
    },
    command: (action, payload, key) =>
      rpc("inventory_command", {
        p_action: action,
        p_payload: payload,
        p_key: key,
      }),
    receivePO: (id, lines, key) =>
      rpc("crm_receive_po", { p_po_id: id, p_lines: lines, p_key: key }),
    async upload(file, progress = () => {}) {
      validateImage(file);
      const { data, error } = await client.auth.getUser();
      if (error) throw new Error(error.message);
      if (!data?.user) throw new Error("Sign in before uploading images");
      const extension = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
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
      if (error) throw new Error(error.message);
      return data.signedUrl;
    },
    watch(refresh) {
      let timer;
      const notify = () => {
        clearTimeout(timer);
        timer = setTimeout(refresh, 150);
      };
      const channel = client.channel(`inventory-${crypto.randomUUID()}`);
      for (const table of [
        "products",
        "product_variants",
        "product_barcodes",
        "inventory_balances",
        "warehouses",
        "warehouse_locations",
        "stock_movements",
        "inventory_job_allocations",
        "product_returns",
        "product_return_items",
        "crm_records",
      ])
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          notify,
        );
      channel.subscribe();
      return () => {
        clearTimeout(timer);
        void client.removeChannel(channel);
      };
    },
  };
}
