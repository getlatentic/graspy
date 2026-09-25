import type { CurriculumData } from "./curriculum-record";
import { learnerDetailsOf, writtenFor } from "./plan-details";
import { withRecoveredLevel } from "./plan-level";
import { getUserProfile, saveUserProfile } from "./user-storage";

/** The device's details are the ones its plan was written for, down to the level: a class
 * the catalogue could not be asked for is found on a later start. */
export async function followPlan(plan: CurriculumData): Promise<void> {
  const profile = getUserProfile();
  const agrees = profile !== null && writtenFor(plan, profile);
  if (agrees && profile.level) return;
  const recovered = await withRecoveredLevel(plan);
  if (agrees && recovered.level === undefined) return;
  saveUserProfile(learnerDetailsOf(recovered, profile?.gradeLevel));
}
