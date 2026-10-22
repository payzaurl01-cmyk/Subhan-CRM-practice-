import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { IMPERSONATION_COOKIE } from "@/features/crm/impersonation.js";
import { ImpersonationRecovery } from "@/features/crm/ImpersonationRecovery";
import { notFound, redirect } from "next/navigation";
import { CRMWorkspace } from "@/features/crm/CRMWorkspace";
import { resolveEntry } from "@/features/crm/routes";
import { getOwnerAccess, requireViewer } from "@/lib/access/session";

export default async function CRMPage({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  const entry = resolveEntry(path);
  if (!entry) notFound();
  const demoMode =
    process.env.NODE_ENV !== "production" &&
    process.env.CRM_E2E_DEMO_AUTH === "1";
  if (demoMode)
    return (
      <CRMWorkspace
        initialPage={entry.page}
        initialViewer={null}
        authEnabled={false}
      />
    );

  const selected = (await cookies()).get(IMPERSONATION_COOKIE)?.value;
  const client = await createServerSupabaseClient();
  const { data: access, error: accessError } = await client.rpc(
    "get_access_context",
    { p_platform: "web" },
  );
  if (
    selected &&
    (accessError ||
      !access?.profile ||
      access.system_lock?.access_blocked ||
      !access.modules?.some((m: { can_view: boolean }) => m.can_view))
  ) {
    const native = await createServerSupabaseClient(true);
    const recovery = await native.rpc("owner_portal_access");
    if (!recovery.error && recovery.data === true)
      return (
        <ImpersonationRecovery
          message={
            accessError?.message ||
            "The target's access is no longer available."
          }
        />
      );
  }
  const viewer = await requireViewer();
  const ownerVerified = await getOwnerAccess();

  // Legacy /owner links are redirects into the normal CRM routes.
  if (path[0] === "owner") {
    const target = path[1] || (ownerVerified ? "master" : "dashboard");
    redirect(
      `/crm/${target === "master" && !ownerVerified ? "dashboard" : target}`,
    );
  }
  // Super Admin tools are only for the verified owner, checked on the server.
  if (entry.page === "master" && !ownerVerified) redirect("/crm/dashboard");

  const moduleKey: Record<string, string> = {
    master: "master_control",
    quotes: "quotations",
    picking: "warehouse",
    returns: "warehouse",
    contacts: "leads",
    calendar: "tasks",
    email: "quotations",
    logs: "settings",
  };
  if (
    entry.page !== "profile" &&
    !access?.modules?.some(
      (m: { key: string; can_view: boolean }) =>
        m.key === (moduleKey[entry.page] || entry.page) && m.can_view,
    )
  ) {
    return (
      <main className="crm-loading">
        <section>
          <h1>Access denied</h1>
          <p>This page is restricted by your effective permissions.</p>
          {selected ? (
            <form method="post" action="/api/impersonation/exit">
              <button className="btn">Exit impersonation</button>
            </form>
          ) : (
            <a href="/crm/dashboard">Return to dashboard</a>
          )}
        </section>
      </main>
    );
  }
  return (
    <CRMWorkspace
      initialPage={entry.page}
      initialViewer={viewer}
      authEnabled
      ownerVerified={ownerVerified}
    />
  );
}
