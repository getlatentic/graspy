import { useCallback, useState } from "react";
import type { Learner } from "@/lib/account/account-store";
import {
  chooseLearner,
  UnsentChanges,
  type ChoiceOptions,
} from "@/lib/account/learner-choice";
import { addLearner, refusalCode } from "@/lib/account/learners-api";

export type ChoiceProblem = "offline" | "unsent" | "full" | "failed";

function problemOf(error: unknown): ChoiceProblem {
  if (error instanceof UnsentChanges)
    return error.offline ? "offline" : "unsent";
  return refusalCode(error) === "too_many_learners" ? "full" : "failed";
}

/** Chooses, or adds and chooses, the learner, then opens the app as them afresh. Online, a
 * switch that would lose what is unsent waits for `anyway`. */
export function useLearnerChoice() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ChoiceProblem | null>(null);
  const [chosen, setChosen] = useState<Learner | null>(null);

  const run = useCallback(
    async (pick: () => Promise<Learner>, options?: ChoiceOptions) => {
      setBusy(true);
      setProblem(null);
      try {
        const learner = await pick();
        setChosen(learner);
        window.location.assign(await chooseLearner(learner, options));
      } catch (error) {
        console.warn("Choosing the learner failed:", error);
        setProblem(problemOf(error));
        setBusy(false);
      }
    },
    [],
  );

  const choose = useCallback(
    (learner: Learner) => run(async () => learner),
    [run],
  );
  const addAndChoose = useCallback(
    (name: string) => run(() => addLearner(name)),
    [run],
  );
  const anyway = useCallback(() => {
    if (chosen) void run(async () => chosen, { loseUnsent: true });
  }, [chosen, run]);
  const cancel = useCallback(() => setProblem(null), []);

  return { busy, problem, choose, addAndChoose, anyway, cancel };
}
