import { notFound, redirect } from "next/navigation";
import { CRMWorkspace } from "@/features/crm/CRMWorkspace";
import { resolveEntry } from "@/features/crm/routes";
import { requireViewer } from "@/lib/access/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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
  if (viewer) {
    const supabase = await createServerSupabaseClient();
    const { data: isOwner, error } = await supabase.rpc("owner_portal_access");
    if (error) redirect("/login?reason=access");
    if (ownerRoute && isOwner !== true) redirect("/crm/dashboard");
    if (isOwner === true && !ownerRoute) redirect("/owner");
  }
  return (
    <CRMWorkspace
      initialPage={entry.page}
      initialViewer={viewer}
      authEnabled={!demoMode}
    />
  );
}
