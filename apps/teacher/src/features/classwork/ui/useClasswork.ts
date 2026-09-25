import { createContext, useContext } from "react";

import type { ClassworkValue } from "./ClassworkContext";

export const ClassworkValueContext = createContext<ClassworkValue | null>(null);

export function useClasswork(): ClassworkValue {
  const value = useContext(ClassworkValueContext);
  if (!value) throw new Error("A classwork screen was rendered outside its workspace.");
  return value;
}
