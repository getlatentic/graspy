import { useCallback, useState } from "react";
import { flushUnsent } from "@/lib/account/learner-choice";
import { signOut } from "@/lib/account/sign-in";

const toLanding = () => window.location.assign("/");

/** Sends what is unsent first; offline, asks before losing it. `after` is where signing out
 * leads, the landing page unless the caller says. */
export function useSignOut(after: () => void = toLanding) {
  const [busy, setBusy] = useState(false);
  const [unsent, setUnsent] = useState(false);

  const leave = useCallback(async () => {
    await signOut().catch((error: unknown) =>
      console.warn("Signing out failed:", error),
    );
    after();
  }, [after]);

  const start = useCallback(async () => {
    setBusy(true);
    if (await flushUnsent()) return leave();
    setUnsent(true);
    setBusy(false);
  }, [leave]);

  const anyway = useCallback(() => {
    setBusy(true);
    void leave();
  }, [leave]);

  const cancel = useCallback(() => setUnsent(false), []);

  return { busy, unsent, start, anyway, cancel };
}
