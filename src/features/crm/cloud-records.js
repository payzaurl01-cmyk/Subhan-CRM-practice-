// Local-only keys: never stored in crm_records.
const LOCAL_KEYS = new Set(["version", "session", "users", "masterAuth"]);
// Normalized inventory is authoritative. Preserve legacy rows for explicit review;
// never synchronize an in-memory stock projection back into the JSON store.
const INVENTORY_KEYS = new Set([
  "products",
  "stockMovements",
  "inventoryBalances",
  "warehouses",
  "warehouseLocations",
]);
const SINGLETON = "_";
const CHUNK = 200;

const isRecordList = (v) =>
  Array.isArray(v) &&
  v.every((x) => x && typeof x === "object" && typeof x.id === "string");

function flatten(state) {
  const rows = new Map();
  for (const [key, value] of Object.entries(state)) {
    if (LOCAL_KEYS.has(key) || INVENTORY_KEYS.has(key) || value === undefined)
      continue;
    if (isRecordList(value)) {
      for (const item of value)
        rows.set(`${key}/${item.id}`, {
          collection: key,
          id: item.id,
          data: item,
        });
    } else {
      rows.set(`${key}/${SINGLETON}`, {
        collection: key,
        id: SINGLETON,
        data: value,
      });
    }
  }
  return rows;
}

// Keep inserts and updates separate: an update-only override must never require
// create permission merely because the client chose an UPSERT transport.
export function createRecordStore(client) {
  let snapshot = new Map();
  const key = (row) => `${row.collection}/${row.id}`;
  function absorb(rows) {
    const state = {};
    snapshot = new Map();
    for (const row of rows) {
      snapshot.set(key(row), JSON.stringify(row.data));
      if (row.id === SINGLETON) state[row.collection] = row.data;
      else (state[row.collection] ??= []).push(row.data);
    }
    return state;
  }
  return {
    // Runtime normalization adds local defaults. Treat those defaults as loaded,
    // rather than attempting to create owner-only settings on a staff save.
    baseline(state) {
      snapshot = new Map(
        [...flatten(state)].map(([k, row]) => [k, JSON.stringify(row.data)]),
      );
    },
    async load() {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await client
          .from("crm_records")
          .select("collection,id,data")
          .order("collection")
          .order("id")
          .range(from, from + 999);
        if (error) throw new Error(error.message);
        rows.push(...data);
        if (data.length < 1000) break;
      }
      return absorb(rows);
    },
    async sync(state) {
      const next = flatten(state);
      const inserts = [];
      const logInserts = [];
      const updates = [];
      for (const [k, row] of next) {
        if (snapshot.get(k) === JSON.stringify(row.data)) continue;
        (snapshot.has(k)
          ? updates
          : row.collection === "logs"
            ? logInserts
            : inserts
        ).push(row);
      }
      const deletes = [...snapshot.keys()].filter(
        (k) => !next.has(k) && !INVENTORY_KEYS.has(k.split("/")[0]),
      );
      for (let i = 0; i < inserts.length; i += CHUNK) {
        const chunk = inserts.slice(i, i + CHUNK);
        const { data, error } = await client
          .from("crm_records")
          .insert(chunk)
          .select("collection,id");
        if (error) throw new Error(error.message);
        if (data?.length !== chunk.length)
          throw new Error("The backend did not confirm all new CRM records");
        for (const row of chunk)
          snapshot.set(key(row), JSON.stringify(row.data));
      }
      // A Super Admin event is intentionally unreadable in the target's scope.
      // Confirm its committed INSERT without asking RLS to return the hidden row.
      for (let i = 0; i < logInserts.length; i += CHUNK) {
        const chunk = logInserts.slice(i, i + CHUNK);
        const { error } = await client.from("crm_records").insert(chunk);
        if (error) throw new Error(error.message);
        for (const row of chunk)
          snapshot.set(key(row), JSON.stringify(row.data));
      }
      for (const row of updates) {
        const { data, error } = await client
          .from("crm_records")
          .update({ data: row.data })
          .eq("collection", row.collection)
          .eq("id", row.id)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        if (!data || data.id !== row.id)
          throw new Error("The backend did not confirm the CRM update");
        snapshot.set(key(row), JSON.stringify(row.data));
      }
      for (const k of deletes) {
        const [collection, ...rest] = k.split("/");
        const id = rest.join("/");
        const { data, error } = await client
          .from("crm_records")
          .delete()
          .eq("collection", collection)
          .eq("id", id)
          .select("id");
        if (error) throw new Error(error.message);
        if (data?.length !== 1 || data[0].id !== id)
          throw new Error("The backend did not confirm the CRM deletion");
        snapshot.delete(k);
      }
    },
  };
}
