import { useCallback, useEffect, useState } from "react";
import {
  prepareSignIn,
  signInAsParent,
  signInProblem,
  type SignInProblem,
} from "@/lib/account/sign-in";

/** The one tap that signs a parent in, whether or not the phone was signed in: `done` is told
 * when the parent's session exists. The problem is null until one arises, and for a parent who
 * closed Google's window. */
export function useParentSignIn(done: () => void) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<SignInProblem | null>(null);

  useEffect(prepareSignIn, []);

  // Not async: Google's popup must open within this tap.
  const start = useCallback(() => {
    setBusy(true);
    setProblem(null);
    signInAsParent()
      .then(done)
      .catch((error: unknown) => {
        const found = signInProblem(error);
        if (found) console.warn("Signing in as the parent failed:", error);
        setProblem(found);
      })
      .finally(() => setBusy(false));
  }, [done]);

  return { busy, problem, signIn: start };
}
