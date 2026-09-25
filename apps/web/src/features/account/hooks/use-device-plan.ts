import { useEffect, useState } from "react";
import { getCurriculum } from "@/lib/curriculum-db";

/** Whether the device holds a plan of its own: before a learner is chosen, it goes to them. */
export function useDeviceHoldsPlan(asked: boolean): boolean {
  const [holds, setHolds] = useState(false);
  useEffect(() => {
    if (!asked) return;
    getCurriculum()
      .then((plan) => setHolds(plan !== null))
      .catch(() => setHolds(false));
  }, [asked]);
  return holds;
}
