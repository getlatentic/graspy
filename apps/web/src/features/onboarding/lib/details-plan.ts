import { getCurriculum } from "@/lib/curriculum-db";
import type { CurriculumData } from "@/lib/curriculum-record";
import { planDetails } from "@/lib/plan-details";
import type { LearnerDetails } from "@/lib/user-storage";
import { keepVoiceOnlyPlan } from "./generate-plan";

/** The plan that new details keep: the saved one, now for the learner. With none saved,
 * as after a plan that failed to be made, a class that learns by voice alone is kept a
 * plan of its own, so the learner's other devices find one; any other class has none. */
export async function keptPlan(
  learner: LearnerDetails,
  voiceOnly: boolean,
): Promise<CurriculumData | null> {
  const saved = await getCurriculum();
  if (saved) return { ...saved, ...planDetails(learner) };
  return voiceOnly ? keepVoiceOnlyPlan(learner) : null;
}
