import { useCallback, useEffect } from "react";
import { useAccount } from "@/lib/account/use-account";
import type { CurriculumData } from "@/lib/curriculum-record";
import { syncPlan } from "@/lib/plan-sync";

/** While signed in: syncs on sign-in, on start, once a new plan is saved, and on
 * reconnecting. Returns the sync to run after each save. `ready` is false while the plan
 * loads or a new one streams in. */
export function usePlanSync(
  ready: boolean,
  show: (plan: CurriculumData) => void,
): () => void {
  const uid = useAccount()?.uid;

  const sync = useCallback(() => {
    syncPlan()
      .then((held) => held && show(held))
      .catch((error: unknown) =>
        console.warn("Syncing the plan failed:", error),
      );
  }, [show]);

  useEffect(() => {
    if (!uid || !ready) return;
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [uid, ready, sync]);

  return sync;
}
