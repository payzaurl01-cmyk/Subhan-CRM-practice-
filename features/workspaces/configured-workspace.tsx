import { getWorkspace } from "./workspace-data";
import { WorkspaceView } from "./workspace-view";

export function ConfiguredWorkspace({ name }: { name: string }) {
  return <WorkspaceView config={getWorkspace(name)} />;
}
