import { useCallback, useState } from "react";
import { currentAccount, type Learner } from "@/lib/account/account-store";
import {
  chooseLearner,
  UnsentChanges,
  type ChoiceOptions,
} from "@/lib/account/learner-choice";
import { refusalCode } from "@/lib/account/account-call";
import {
  consentProblemOf,
  type ConsentProblem,
} from "@/lib/account/consent-problem";
import {
  addLearner,
  type ConsentProof,
  type ServiceConsent,
} from "@/lib/account/learners-api";
import { keepServiceConsent } from "@/lib/account/service-consent";

/** A learner as the account lists them, or as the device holds them. */
type Picked = Learner & { serviceConsent?: ServiceConsent | null };

export type ChoiceProblem = "offline" | "unsent" | "full" | ConsentProblem;

function problemOf(error: unknown): ChoiceProblem {
  if (error instanceof UnsentChanges)
    return error.offline ? "offline" : "unsent";
  if (refusalCode(error) === "too_many_learners") return "full";
  return consentProblemOf(error) ?? "failed";
}

/** Chooses, or adds and chooses, the learner, then opens the app as them afresh. Online, a
 * switch that would lose what is unsent waits for `anyway`. */
export function useLearnerChoice() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ChoiceProblem | null>(null);
  const [chosen, setChosen] = useState<Learner | null>(null);

  const run = useCallback(
    async (pick: () => Promise<Picked>, options?: ChoiceOptions) => {
      setBusy(true);
      setProblem(null);
      try {
        const learner = await pick();
        const account = currentAccount();
        if (account && learner.serviceConsent) {
          keepServiceConsent(account.uid, learner.id);
        }
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
    (learner: Picked) => run(async () => learner),
    [run],
  );
  const addAndChoose = useCallback(
    (name: string, consent: ConsentProof) =>
      run(() => addLearner(name, consent)),
    [run],
  );
  const anyway = useCallback(() => {
    if (chosen) void run(async () => chosen, { loseUnsent: true });
  }, [chosen, run]);
  const cancel = useCallback(() => setProblem(null), []);

  return { busy, problem, choose, addAndChoose, anyway, cancel };
}
