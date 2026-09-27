import type { CurriculumData } from "./curriculum-record";
import type { LearnerPin } from "./learner-pin";
import { learnerDetailsOf, writtenFor } from "./plan-details";
import { withRecoveredLevel } from "./plan-level";
import { getUserProfile, saveUserProfile } from "./user-storage";

/** The device's details are the ones its plan was written for, down to the level: a class
 * the catalogue could not be asked for is found on a later start. The catalogue may answer
 * after the device learns as someone else: `pin` then stops the details going to them. */
export async function followPlan(
  plan: CurriculumData,
  pin: Pick<LearnerPin<unknown>, "hold">,
): Promise<void> {
  const profile = getUserProfile();
  const agrees = profile !== null && writtenFor(plan, profile);
  if (agrees && profile.level) return;
  const recovered = await withRecoveredLevel(plan);
  if (agrees && recovered.level === undefined) return;
  pin.hold();
  saveUserProfile(learnerDetailsOf(recovered, profile?.gradeLevel));
}
