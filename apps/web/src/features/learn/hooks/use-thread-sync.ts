import { useCallback, useEffect } from "react";
import { useAccount } from "@/lib/account/use-account";
import { syncThreads } from "@/lib/threads/thread-sync";

/** While a learner is chosen: syncs their conversations on start, on reconnecting and on
 * coming back to the app. Returns the sync to run after each turn. */
export function useThreadSync(): () => void {
  const learner = useAccount()?.learner?.id;

  const sync = useCallback(() => {
    syncThreads().catch((error: unknown) =>
      console.warn("Syncing the conversations failed:", error),
    );
  }, []);

  useEffect(() => {
    if (!learner) return;
    const shown = () => {
      if (document.visibilityState === "visible") sync();
    };
    sync();
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", shown);
    return () => {
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", shown);
    };
  }, [learner, sync]);

  return sync;
}
