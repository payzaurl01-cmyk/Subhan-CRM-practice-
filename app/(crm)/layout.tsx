import { CrmShell } from "@/components/layout/crm-shell";
import { requireViewer } from "@/lib/access/session";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  return <CrmShell viewer={viewer}>{children}</CrmShell>;
}
