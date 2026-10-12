"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Viewer } from "@/lib/access/session";
import { createCRMAuthBackend } from "./auth-backend";
import { mountCRM } from "./runtime";
export function CRMWorkspace({
  initialPage,
  initialViewer,
  authEnabled,
}: {
  initialPage: string;
  initialViewer: Viewer | null;
  authEnabled: boolean;
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
    // Only this client effect touches browser storage, media, or DOM APIs.
    // An imperative island preserves the original workflows during migration.
    // React owns the host; the runtime exclusively owns its descendants.
    element.innerHTML =
      '<div id="app"></div><div id="overlay" class="modal-layer"></div><div id="toasts" class="toast-wrap" aria-live="polite"></div>';
    try {
      return mountCRM(element, initialPage, { viewer: initialViewer, auth });
    } catch (error) {
      console.error(error);
      setFailure(
        error instanceof Error ? error.message : "Unable to open workspace",
      );
    }
  }, [auth, initialPage, initialViewer]);
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
