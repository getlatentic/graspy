import { deviceId } from "@/lib/device-id";
import { changePlanRecord } from "@/lib/learner-record";

// The server drops what it kept for any other plan once told which one is current. Telling it
// again of a plan it already knows changes nothing, and costs a write to the learner's record,
// which waits on that record's cold start, so it is sent once per device and plan.
const KEPT_KEY = "graspy.planKept";

const markOf = (planId: string) => `${deviceId()}|${planId}`;

function toldOf(planId: string): boolean {
  try {
    return window.localStorage.getItem(KEPT_KEY) === markOf(planId);
  } catch {
    return false;
  }
}

function keepTold(planId: string): void {
  try {
    window.localStorage.setItem(KEPT_KEY, markOf(planId));
  } catch {
    // Storage refused: the server is told again next time.
  }
}

/** Tells the server which plan is current, unless this device already did. A failure is
 * left unmarked, so the next visit tries again. */
export async function tellPlanKept(planId: string): Promise<void> {
  if (toldOf(planId)) return;
  await changePlanRecord({ kind: "plan_kept", planId });
  keepTold(planId);
}
