"use client";

import {
  createScopedFetch,
  impersonationId,
} from "@/features/crm/impersonation.js";
import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig, isSupabaseConfigured } from "./config";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createBrowserSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (browserClient) return browserClient;

  const { url, publishableKey } = getSupabaseConfig();
  browserClient = createBrowserClient(url, publishableKey, {
    global: { fetch: createScopedFetch() },
  });
  if (
    typeof window !== "undefined" &&
    typeof BroadcastChannel !== "undefined"
  ) {
    const identityEvents = new BroadcastChannel("crm-identity-change");
    identityEvents.onmessage = () => {
      void browserClient?.removeAllChannels();
      window.location.reload();
    };
  }
  if (impersonationId()) {
    // Realtime authenticates the real JWT; polling remains available for the target.
    browserClient.channel = (() => {
      const channel = {
        on: () => channel,
        subscribe: () => channel,
        unsubscribe: async () => "ok",
      };
      return channel;
    }) as typeof browserClient.channel;
    browserClient.removeChannel = (async () =>
      "ok") as typeof browserClient.removeChannel;
  }
  return browserClient;
}
