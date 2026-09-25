import { useCallback, useEffect, useState } from "react";
import {
  prepareSignIn,
  signIn,
  signInProblem,
  type SignInProblem,
} from "@/lib/account/sign-in";

/** For a signed-out device; signing in then asks who is learning. */
export function useGoogleSignIn() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<SignInProblem | null>(null);

  useEffect(prepareSignIn, []);

  // Not async: Google's popup must open within this tap.
  const start = useCallback(() => {
    setBusy(true);
    setProblem(null);
    signIn()
      .catch((error: unknown) => {
        const found = signInProblem(error);
        if (found) console.warn("Signing in failed:", error);
        setProblem(found);
      })
      .finally(() => setBusy(false));
  }, []);

  return { busy, problem, signIn: start };
}
