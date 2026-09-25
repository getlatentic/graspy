import type { ReactNode } from "react";

interface PlanMyTermProps {
  readonly children: ReactNode;
}

/**
 * Where a teacher goes to plan a term's weekly scheme, rather than something
 * they pass through to reach a lesson. Managing classes and curriculum is its
 * own place now (Classes), so this stays about the plan.
 */
export function PlanMyTerm({ children }: PlanMyTermProps) {
  return (
    <main className="flex min-w-0 flex-col gap-md p-lg max-sm:px-sm max-sm:py-md">
      <div className="flex flex-wrap items-baseline justify-between gap-sm border-b border-rule pb-sm">
        <h1 className="m-0 font-display text-lg leading-heading text-ink">Plan my term</h1>
      </div>
      {children}
    </main>
  );
}
