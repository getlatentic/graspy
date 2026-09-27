import type { CurriculumData } from "@/lib/curriculum-record";
import { LearnerChanged } from "@/lib/learner-pin";
import type { LearnerDetails } from "@/lib/user-storage";
import { keepDetails } from "./details-plan";

/** What became of saving the details: kept; left, as the device came to learn as someone
 * else; or failed, for the learner to try again. */
export type DetailsSaved = "kept" | "left" | "failed";

/** Keeps the learner's new details, and has the plan they keep take them through `apply`. */
export async function saveDetails(
  learner: LearnerDetails,
  voiceOnly: boolean,
  apply: (plan: CurriculumData) => Promise<void>,
): Promise<DetailsSaved> {
  try {
    const plan = await keepDetails(learner, voiceOnly);
    if (plan) await apply(plan);
    return "kept";
  } catch (error) {
    if (error instanceof LearnerChanged) return "left";
    console.error("Saving the details failed:", error);
    return "failed";
  }
}
