import { currentAccount } from "@/lib/account/account-store";
import { getCurriculum } from "@/lib/curriculum-db";
import type { CurriculumData } from "@/lib/curriculum-record";
import { planDetails } from "@/lib/plan-details";
import { syncPlan } from "@/lib/plan-sync";
import type { LearnerDetails } from "@/lib/user-storage";
import { keepVoiceOnlyPlan } from "./generate-plan";

// A signed-in device without a plan takes the account's first: a new plan would be
// newer and replace it. Unreached, the device cannot know, so it makes none.
async function heldPlan(): Promise<CurriculumData | null | undefined> {
  const saved = await getCurriculum();
  if (saved || !currentAccount()) return saved;
  const reached = await syncPlan().then(
    () => true,
    () => false,
  );
  return reached ? getCurriculum() : undefined;
}

/** The plan that new details keep: the saved one, now for the learner. With none saved,
 * as after a plan that failed to be made, a class that learns by voice alone is kept a
 * plan of its own, so the learner's other devices find one; any other class has none. */
export async function keptPlan(
  learner: LearnerDetails,
  voiceOnly: boolean,
): Promise<CurriculumData | null> {
  const held = await heldPlan();
  if (held) return { ...held, ...planDetails(learner) };
  return held === null && voiceOnly ? keepVoiceOnlyPlan(learner) : null;
}
