import { useCallback, useEffect, useState } from "react";
import { listLearners, type AccountLearner } from "@/lib/account/learners-api";

/** The account's learners; null while they load. */
export function useLearners() {
  const [learners, setLearners] = useState<AccountLearner[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(() => {
    setFailed(false);
    listLearners()
      .then(setLearners)
      .catch((error: unknown) => {
        console.warn("Listing the learners failed:", error);
        setFailed(true);
      });
  }, []);

  useEffect(reload, [reload]);

  return { learners, failed, reload, setLearners };
}
