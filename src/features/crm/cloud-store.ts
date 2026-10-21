"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

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

type Row = { collection: string; id: string; data: unknown };
type State = Record<string, unknown>;

const isRecordList = (v: unknown): v is { id: string }[] =>
  Array.isArray(v) &&
  v.every(
    (x) =>
      x &&
      typeof x === "object" &&
      typeof (x as { id?: unknown }).id === "string",
  );

function flatten(state: State) {
  const rows = new Map<string, Row>();
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

export function createCloudStore() {
  const client = createBrowserSupabaseClient();
  if (!client) return null;
  let snapshot = new Map<string, string>();

  function absorb(rows: Row[]) {
    const state: State = {};
    snapshot = new Map();
    for (const row of rows) {
      snapshot.set(`${row.collection}/${row.id}`, JSON.stringify(row.data));
      if (row.id === SINGLETON) state[row.collection] = row.data;
      else {
        ((state[row.collection] ??= []) as unknown[]).push(row.data);
      }
    }
    return state;
  }

  return {
    /** Loads every CRM record from Supabase. Throws on failure. */
    async load(): Promise<State> {
      const rows: Row[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await client
          .from("crm_records")
          .select("collection,id,data")
          .order("collection")
          .order("id")
          .range(from, from + 999);
        if (error) throw new Error(error.message);
        rows.push(...(data as Row[]));
        if (!data || data.length < 1000) break;
      }
      return absorb(rows);
    },
    /** Active staff directory (id, name, email, role). */
    async staff() {
      const { data, error } = await client.rpc("crm_staff");
      if (error) throw new Error(error.message);
      return (data || []) as {
        id: string;
        email: string | null;
        full_name: string | null;
        role_key: string;
        role_name: string;
      }[];
    },
    async putMedia(key: string, blob: Blob) {
      const { error } = await client.storage
        .from("crm-media")
        .upload(key, blob, { contentType: blob.type, upsert: true });
      if (error) throw new Error(error.message);
    },
    async getMedia(key: string): Promise<Blob | undefined> {
      const { data, error } = await client.storage
        .from("crm-media")
        .download(key);
      return error ? undefined : data;
    },
    async deleteMedia(key: string) {
      const { error } = await client.storage.from("crm-media").remove([key]);
      if (error) throw new Error(error.message);
    },
    /** Writes only what changed since the last confirmed sync. Throws on failure. */
    async sync(state: State) {
      const next = flatten(state);
      const upserts: Row[] = [];
      const serialized = new Map<string, string>();
      for (const [k, row] of next) {
        const json = JSON.stringify(row.data);
        serialized.set(k, json);
        if (snapshot.get(k) !== json) upserts.push(row);
      }
      const deletes = [...snapshot.keys()].filter(
        (k) => !next.has(k) && !INVENTORY_KEYS.has(k.split("/")[0]),
      );
      for (let i = 0; i < upserts.length; i += CHUNK) {
        const { error } = await client
          .from("crm_records")
          .upsert(upserts.slice(i, i + CHUNK), { onConflict: "collection,id" });
        if (error) throw new Error(error.message);
        for (const r of upserts.slice(i, i + CHUNK)) {
          const k = `${r.collection}/${r.id}`;
          snapshot.set(k, serialized.get(k)!);
        }
      }
      for (const k of deletes) {
        const [collection, ...rest] = k.split("/");
        const { error } = await client
          .from("crm_records")
          .delete()
          .eq("collection", collection)
          .eq("id", rest.join("/"));
        if (error) throw new Error(error.message);
        snapshot.delete(k);
      }
    },
  };
}

export type CloudStore = NonNullable<ReturnType<typeof createCloudStore>>;
