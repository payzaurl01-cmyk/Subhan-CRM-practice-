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

  return (
    <CRMWorkspace
      initialPage={entry.page}
      initialViewer={viewer}
      authEnabled
      ownerVerified={ownerVerified}
    />
  );
}
