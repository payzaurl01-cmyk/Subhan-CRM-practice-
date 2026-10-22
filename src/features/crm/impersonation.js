// The cookie selects an audited server record. It contains no JWT or user role.
export const IMPERSONATION_COOKIE = "crm-impersonation";
export function impersonationId(cookie = globalThis.document?.cookie || "") {
  const value = cookie
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${IMPERSONATION_COOKIE}=`))
    ?.split("=")[1];
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
export function setImpersonation(id) {
  document.cookie = `${IMPERSONATION_COOKIE}=${encodeURIComponent(id)}; Path=/; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}${id ? "" : "; Max-Age=0"}`;
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("crm-identity-change");
    channel.postMessage({ type: "impersonation-changed" });
    channel.close();
  }
}
export function createScopedFetch(
  fetcher = globalThis.fetch,
  getId = impersonationId,
) {
  return async (input, init = {}) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    const id = getId();
    const headers = new Headers(
      init.headers || (input instanceof Request ? input.headers : undefined),
    );
    // Exit uses the original actor, including when the target is locked or expired.
    const exit = url.pathname.endsWith("/rpc/end_impersonation");
    if (exit) headers.delete("x-crm-impersonation");
    if (id && !exit) {
      // Storage and Auth do not share PostgREST request.headers. Never send the
      // owner's authority to these services while displaying a target workspace.
      if (
        url.pathname.startsWith("/storage/v1/") ||
        url.pathname.startsWith("/functions/v1/") ||
        (url.pathname.startsWith("/auth/v1/") &&
          !["GET"].includes(
            init.method || (input instanceof Request ? input.method : "GET"),
          ) &&
          !url.pathname.endsWith("/token"))
      ) {
        return new Response(
          JSON.stringify({
            message:
              "Exit impersonation before using private files or changing authentication settings.",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
      headers.set("x-crm-impersonation", id);
    }
    return fetcher(input, { ...init, headers });
  };
}
