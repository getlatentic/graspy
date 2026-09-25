import { useCallback, useState } from "react";
import { flushUnsent } from "@/lib/account/learner-choice";
import { signOut } from "@/lib/account/sign-in";

async function leave(): Promise<void> {
  await signOut().catch((error: unknown) =>
    console.warn("Signing out failed:", error),
  );
  window.location.assign("/");
}

/** Sends what is unsent first; offline, asks before losing it. */
export function useSignOut() {
  const [busy, setBusy] = useState(false);
  const [unsent, setUnsent] = useState(false);

  const start = useCallback(async () => {
    setBusy(true);
    if (await flushUnsent()) return leave();
    setUnsent(true);
    setBusy(false);
  }, []);

  const anyway = useCallback(() => {
    setBusy(true);
    void leave();
  }, []);

  const cancel = useCallback(() => setUnsent(false), []);

  return { busy, unsent, start, anyway, cancel };
}
