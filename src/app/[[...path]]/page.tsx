import { notFound, redirect } from "next/navigation";
import { CRMWorkspace } from "@/features/crm/CRMWorkspace";
import { resolveEntry } from "@/features/crm/routes";
import { OWNER_EMAIL, requireViewer } from "@/lib/access/session";
export default async function CRMPage({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  if (path.length === 1 && path[0] === "applelandpk@gmail.com")
    redirect("/owner");
  const entry = resolveEntry(path);
  if (!entry) notFound();
  const demoMode =
    process.env.NODE_ENV !== "production" &&
    process.env.CRM_E2E_DEMO_AUTH === "1";
  const viewer = demoMode ? null : await requireViewer();
  const ownerRoute = path[0] === "owner";
  if (
    viewer &&
    ownerRoute &&
    (viewer.role !== "super_admin" ||
      viewer.email.toLowerCase() !== OWNER_EMAIL)
  ) {
    redirect("/crm/dashboard");
  }
  if (viewer?.role === "super_admin" && !ownerRoute) redirect("/owner");
  return (
    <CRMWorkspace
      initialPage={entry.page}
      initialViewer={viewer}
      authEnabled={!demoMode}
    />
  );
}
