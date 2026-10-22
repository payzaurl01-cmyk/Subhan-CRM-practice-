import "server-only";

import { createServerClient } from "@supabase/ssr";
import { IMPERSONATION_COOKIE } from "@/features/crm/impersonation.js";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./config";

export async function createServerSupabaseClient(nativeActor = false) {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseConfig();

  const selected = nativeActor
    ? ""
    : cookieStore.get(IMPERSONATION_COOKIE)?.value;
  return createServerClient(url, publishableKey, {
    global: { headers: selected ? { "x-crm-impersonation": selected } : {} },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies. src/proxy.ts refreshes them.
        }
      },
    },
  });
}
