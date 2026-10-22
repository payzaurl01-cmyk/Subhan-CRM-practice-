"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

import { createRecordStore } from "./cloud-records.js";

export function createCloudStore() {
  const client = createBrowserSupabaseClient();
  if (!client) return null;
  return {
    ...createRecordStore(client),
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
  };
}

export type CloudStore = NonNullable<ReturnType<typeof createCloudStore>>;
