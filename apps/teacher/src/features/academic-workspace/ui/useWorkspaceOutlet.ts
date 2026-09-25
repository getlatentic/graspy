import { useOutletContext } from "react-router";

import type { WorkspaceOutletContext } from "./AcademicWorkspaceShell";

export function useWorkspaceOutlet(): WorkspaceOutletContext {
  return useOutletContext<WorkspaceOutletContext>();
}
