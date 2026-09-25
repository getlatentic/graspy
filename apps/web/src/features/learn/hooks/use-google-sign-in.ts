import { useCallback, useEffect, useState } from "react";
import {
  prepareSignIn,
  signIn,
  signInProblem,
  signOut,
  type SignInProblem,
} from "@/lib/account/sign-in";

function signOutOrWarn(): void {
  signOut().catch((error: unknown) =>
    console.warn("Signing out of Google failed:", error),
  );
}

export function useGoogleSignIn(signedIn: boolean) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<SignInProblem | null>(null);

  useEffect(() => {
    if (!signedIn) prepareSignIn();
  }, [signedIn]);

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

  return { busy, problem, signIn: start, signOut: signOutOrWarn };
}
