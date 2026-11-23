import { useCallback, useEffect, useState } from "react";
import {
  hasParentSession,
  parentSessionEnds,
  ParentSignInNeeded,
  startParentSession,
} from "@/lib/api/session";

/** What is the parent's asks them to sign in with Google again first. `needsParent` is true until
 * they have, and again when the server ends the parent's session after its minutes; `refused`
 * says, of an error, whether it was that session being gone. */
export function useParentGate() {
  const [needsParent, setNeedsParent] = useState(() => !hasParentSession());

  useEffect(() => {
    const ends = parentSessionEnds();
    if (needsParent || ends === null) return;
    const timer = setTimeout(
      () => setNeedsParent(true),
      Math.max(0, ends - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [needsParent]);

  /** Takes the parent's session from a Google sign-in made just now. */
  const startAsParent = useCallback(async (firebaseIdToken: string) => {
    await startParentSession(firebaseIdToken);
    setNeedsParent(false);
  }, []);

  const refused = useCallback((error: unknown) => {
    if (!(error instanceof ParentSignInNeeded)) return false;
    setNeedsParent(true);
    return true;
  }, []);

  return { needsParent, startAsParent, refused };
}
