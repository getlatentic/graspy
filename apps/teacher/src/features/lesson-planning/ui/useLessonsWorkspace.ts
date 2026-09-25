import { createContext, useContext } from "react";

import type { LessonsWorkspaceValue } from "./LessonsWorkspaceContext";

export const LessonsWorkspaceValueContext = createContext<LessonsWorkspaceValue | null>(null);

export function useLessonsWorkspace(): LessonsWorkspaceValue {
  const value = useContext(LessonsWorkspaceValueContext);
  if (!value) throw new Error("A lessons screen was rendered outside its workspace.");
  return value;
}
