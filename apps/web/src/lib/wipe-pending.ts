// A wipe finished again on the next start, before anything runs: a request still in flight
// when the device was wiped may write its answer back.

const PENDING_KEY = "graspy.wipe";

type Wipe = "device" | "learner";

export function wipeOnNextStart(wipe: Wipe): void {
  try {
    window.localStorage.setItem(PENDING_KEY, wipe);
  } catch {
    // Storage refused: nothing was written back to it either.
  }
}

function pending(): Wipe | null {
  try {
    return window.localStorage.getItem(PENDING_KEY) as Wipe | null;
  } catch {
    return null;
  }
}

/** Loaded only when a wipe is pending, so a start without one downloads nothing more. */
export async function finishPendingWipe(): Promise<void> {
  const wipe = pending();
  if (!wipe) return;
  const { wipeDevice, wipeLearnerData } = await import("./device-wipe");
  await (wipe === "device" ? wipeDevice() : wipeLearnerData());
}
