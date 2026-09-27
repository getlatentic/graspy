import type { ReactNode } from "react";
import { MemoryRouter, type InitialEntry } from "react-router";
import { I18nContext } from "@/lib/i18n-context";
import { PlanContext } from "@/features/learn/learner-context";
import type { LearnerPlan } from "@/features/learn/hooks/use-learner-plan";

// Each message is its key, so a test reads which message a page chose.
const KEYS = {
  locale: "en",
  setLocale: () => undefined,
  t: (key: string) => key,
};

/** What a learner's page sits in: the interface's messages, the plan and the router. */
export function LearnerApp({
  plan,
  at = "/app/learn",
  children,
}: {
  plan: LearnerPlan;
  at?: InitialEntry;
  children: ReactNode;
}) {
  return (
    <I18nContext.Provider value={KEYS}>
      <PlanContext.Provider value={plan}>
        <MemoryRouter initialEntries={[at]}>{children}</MemoryRouter>
      </PlanContext.Provider>
    </I18nContext.Provider>
  );
}
