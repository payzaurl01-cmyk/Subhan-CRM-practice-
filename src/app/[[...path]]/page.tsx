import { notFound, redirect } from "next/navigation";
import { CRMWorkspace } from "@/features/crm/CRMWorkspace";
import { resolveEntry } from "@/features/crm/routes";
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
  return <CRMWorkspace initialPage={entry.page} />;
}
