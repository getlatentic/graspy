import type { ReactNode } from "react";

export function ProblemNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm font-medium text-danger">
      {children}
    </p>
  );
}
