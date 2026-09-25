import { useCallback, useState } from "react";
import type { Learner } from "@/lib/account/account-store";
import { chooseLearner, UnsentChanges } from "@/lib/account/learner-choice";
import { addLearner, refusalCode } from "@/lib/account/learners-api";

export type ChoiceProblem = "unsent" | "full" | "failed";

function problemOf(error: unknown): ChoiceProblem {
  if (error instanceof UnsentChanges) return "unsent";
  return refusalCode(error) === "too_many_learners" ? "full" : "failed";
}

/** Chooses, or adds and chooses, the learner, then opens the app as them afresh. */
export function useLearnerChoice() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ChoiceProblem | null>(null);

  const run = useCallback(async (pick: () => Promise<Learner>) => {
    setBusy(true);
    setProblem(null);
    try {
      window.location.assign(await chooseLearner(await pick()));
    } catch (error) {
      console.warn("Choosing the learner failed:", error);
      setProblem(problemOf(error));
      setBusy(false);
    }
  }, []);

  const choose = useCallback(
    (learner: Learner) => run(async () => learner),
    [run],
  );
  const addAndChoose = useCallback(
    (name: string) => run(() => addLearner(name)),
    [run],
  );

  return { busy, problem, choose, addAndChoose };
}
