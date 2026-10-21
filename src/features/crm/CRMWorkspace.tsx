"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Viewer } from "@/lib/access/session";
import { createCRMAuthBackend } from "./auth-backend";
import { createCloudStore } from "./cloud-store";
import { mountCRM } from "./runtime";
export function CRMWorkspace({
  initialPage,
  initialViewer,
  authEnabled,
  ownerVerified = false,
}: {
  initialPage: string;
  initialViewer: Viewer | null;
  authEnabled: boolean;
  ownerVerified?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const auth = useMemo(
    () => (authEnabled ? createCRMAuthBackend() : null),
    [authEnabled],
  );
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    // An imperative island preserves the original workflows during migration.
    // React owns the host; the runtime exclusively owns its descendants.
    (async () => {
      try {
        let cloud = null;
        let accounts = null;
        let inventory = null;
        if (authEnabled) {
          if (!auth) throw new Error("Supabase is not configured.");
          const context = await auth.accounts.context();
          const [list, rules] = await Promise.all([
            auth.accounts.list(context),
            auth.accounts.permissionRules(context),
          ]);
          accounts = { context, accounts: list, rules };
          if (
            context.modules.some(
              (module: { key: string; can_view: boolean }) =>
                ["inventory", "warehouse"].includes(module.key) &&
                module.can_view,
            )
          ) {
            try {
              inventory = { data: await auth.inventory.load(), error: "" };
            } catch (error) {
              inventory = {
                data: null,
                error:
                  error instanceof Error
                    ? error.message
                    : "Inventory could not load",
              };
            }
          }
          const store = createCloudStore();
          if (!store) throw new Error("Supabase is not configured.");
          cloud = {
            store,
            data: await store.load(),
            staff: await store.staff(),
          };
        }
        if (cancelled) return;
        element.innerHTML =
          '<div id="app"></div><div id="overlay" class="modal-layer"></div><div id="toasts" class="toast-wrap" aria-live="polite"></div>';
        dispose = mountCRM(element, initialPage, {
          viewer: initialViewer,
          auth,
          cloud,
          accounts,
          inventory,
          ownerVerified,
        });
      } catch (error) {
        console.error(error);
        if (!cancelled)
          setFailure(
            error instanceof Error ? error.message : "Unable to open workspace",
          );
      }
    })();
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [auth, authEnabled, initialPage, initialViewer, ownerVerified]);
  if (failure)
    return (
      <main className="crm-loading">
        <div>
          <h1>Workspace could not open</h1>
          <p>{failure}</p>
          <button className="btn" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </main>
    );
  return (
    <div className="crm-host" ref={host}>
      <div className="crm-loading" role="status">
        Opening workspace…
      </div>
    </div>
  );
}
