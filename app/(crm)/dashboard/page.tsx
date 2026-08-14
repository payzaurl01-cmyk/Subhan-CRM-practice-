import { DashboardView } from "@/features/dashboard/dashboard-view";
import { requireViewer } from "@/lib/access/session";

export default async function DashboardPage() {
  const viewer = await requireViewer();
  return <DashboardView name={viewer.name} />;
}
