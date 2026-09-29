import { useCallback, useEffect, useState } from "react";
import {
  consentProblemOf,
  type ConsentProblem,
} from "@/lib/account/consent-problem";
import { prepareSignIn, signInAgain } from "@/lib/account/sign-in";

/** A parent's agreement: they sign in with Google again, and `submit` sends what the fresh
 * sign-in gives. The problem is null until one arises, and for a parent who closed Google's
 * window. */
export function useAgreement(
  submit: (firebaseIdToken: string) => Promise<void>,
) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ConsentProblem | null>(null);

  useEffect(prepareSignIn, []);

  // Not async: Google's popup must open within this tap.
  const agree = useCallback(() => {
    setBusy(true);
    setProblem(null);
    signInAgain()
      .then(submit)
      .catch((error: unknown) => {
        const found = consentProblemOf(error);
        if (found) console.warn("Agreeing failed:", error);
        setProblem(found);
      })
      .finally(() => setBusy(false));
  }, [submit]);

  return { busy, problem, agree };
}
