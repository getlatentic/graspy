import type { CurriculumData } from "./curriculum-record";
import { planDetails } from "./plan-details";
import type { LearnerDetails } from "./user-storage";

// Details a learner saved while the device had no plan and waited for their account's. Until
// the device holds a plan at least as new, a plan it takes that is older takes the details on,
// dated as they were saved: the device then sends them as a change of its own. Without this
// the older plan's class would be written back over the learner's edit.

const DUE_KEY = "graspy.details.due";

interface Due {
  learner: string;
  details: LearnerDetails;
  at: number;
}

function due(learner: string): Due | null {
  try {
    const kept = JSON.parse(window.localStorage.getItem(DUE_KEY) ?? "null");
    return (kept as Due | null)?.learner === learner ? kept : null;
  } catch {
    return null;
  }
}

function forget(): void {
  try {
    window.localStorage.removeItem(DUE_KEY);
  } catch {
    // Storage refused: nothing was kept.
  }
}

/** Keeps `details` for the next plan the device takes for `learner`. */
export function keepDetailsDue(learner: string, details: LearnerDetails): void {
  const kept: Due = { learner, details, at: Date.now() };
  try {
    window.localStorage.setItem(DUE_KEY, JSON.stringify(kept));
  } catch {
    // Storage refused: a plan taken later keeps its own details.
  }
}

/** `plan` with the details due for `learner` when they are newer than it. */
export function withDetailsDue(
  plan: CurriculumData,
  learner: string,
): CurriculumData {
  const kept = due(learner);
  if (!kept || plan.updatedAt >= kept.at) return plan;
  return { ...plan, ...planDetails(kept.details), updatedAt: kept.at };
}

/** Forgets the details due once the learner and the device agree on a plan as new. */
export function settleDetailsDue(plan: CurriculumData, learner: string): void {
  const kept = due(learner);
  if (kept && plan.updatedAt >= kept.at) forget();
}
