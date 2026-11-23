import { useCallback, useState } from "react";
import {
  consentProblemOf,
  type ConsentProblem,
} from "@/lib/account/consent-problem";
import { refusalCode } from "@/lib/account/account-call";
import {
  dropParentSession,
  parentRefused,
  parentSessionAge,
} from "@/lib/api/session";

// An agreement needs a parent's session that is this young (the server holds it to two minutes).
const FRESH_MS = 100 * 1000;

/** A parent's agreement: the tap on "I agree" opens the parent gate, and once the parent's session
 * is in force `proceed` sends the agreement under it. While `asking`, the screen shows the gate
 * in place of the notice. An agreement that fails comes back to the notice with `problem`; a
 * parent's session that ended meanwhile leaves the gate up, to ask for the PIN again. */
export function useParentAgreement(submit: () => Promise<unknown>) {
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<ConsentProblem | null>(null);

  const agree = useCallback(() => {
    setProblem(null);
    // A child handed an unlocked phone must not be able to tap "I agree" on the strength of a PIN
    // typed minutes ago: the PIN is asked for again.
    const age = parentSessionAge();
    if (age !== null && age > FRESH_MS) dropParentSession();
    setAsking(true);
  }, []);
  const cancel = useCallback(() => setAsking(false), []);

  const proceed = useCallback(() => {
    submit()
      .then(() => setAsking(false))
      .catch((error: unknown) => {
        if (parentRefused(error)) return;
        if (refusalCode(error) === "parent_fresh_required") {
          dropParentSession();
          return;
        }
        const found = consentProblemOf(error);
        if (found) console.warn("Agreeing failed:", error);
        setProblem(found);
        setAsking(false);
      });
  }, [submit]);

  return { asking, problem, agree, cancel, proceed };
}
