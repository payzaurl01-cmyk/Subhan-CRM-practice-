"use client";

import { useEffect, useState } from "react";

export function ImpersonationRecovery({ message }: { message: string }) {
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/impersonation/exit", { method: "POST" })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json();
          throw Error(body.error || "Session cleanup could not be confirmed.");
        }
        if (!response.redirected)
          throw Error("Session recovery was not confirmed.");
        if (!cancelled) window.location.replace(response.url);
      })
      .catch((failure) => {
        if (!cancelled) setError(failure.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <main className="crm-loading">
      <section>
        <h1>Impersonation needs attention</h1>
        <p>{message}</p>
        <p role={error ? "alert" : "status"}>
          {error || "Ending impersonation and restoring your session…"}
        </p>
        <form method="post" action="/api/impersonation/exit">
          <button className="btn" type="submit">
            Return to Super Admin
          </button>
        </form>
      </section>
    </main>
  );
}
