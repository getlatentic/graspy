import { useCallback, useState } from "react";
import {
  consentProblemOf,
  type ConsentProblem,
} from "@/lib/account/consent-problem";
import { parentRefused } from "@/lib/api/session";

/** A parent's agreement: the tap on "I agree" opens the parent gate, and once the parent's session
 * is in force `proceed` sends the agreement under it. While `asking`, the screen shows the gate
 * in place of the notice. An agreement that fails comes back to the notice with `problem`; a
 * parent's session that ended meanwhile leaves the gate up, to ask for the PIN again. */
export function useParentAgreement(submit: () => Promise<unknown>) {
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<ConsentProblem | null>(null);

  const agree = useCallback(() => {
    setProblem(null);
    setAsking(true);
  }, []);
  const cancel = useCallback(() => setAsking(false), []);

  const proceed = useCallback(() => {
    submit()
      .then(() => setAsking(false))
      .catch((error: unknown) => {
        if (parentRefused(error)) return;
        const found = consentProblemOf(error);
        if (found) console.warn("Agreeing failed:", error);
        setProblem(found);
        setAsking(false);
      });
  }, [submit]);

  return { asking, problem, agree, cancel, proceed };
}
