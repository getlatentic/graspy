import { keepVoiceOnlyPlan } from "@/features/onboarding/lib/generate-plan";
import { getCurriculum } from "@/lib/curriculum-db";
import { detectLocale } from "@/lib/locale-detector";
import { syncPlan } from "@/lib/plan-sync";
import {
  getUserProfile,
  saveUserProfile,
  type LearnerDetails,
} from "@/lib/user-storage";

/** Where the device guesses the learner is, and English, the language lessons are in; the
 * class is asked for in the chat, when a subject needs it. */
function startingDetails(): LearnerDetails {
  return {
    country: detectLocale().country ?? "",
    language: "en",
    system: "",
    level: "",
    levelNames: null,
    course: "",
    gradeLevel: "",
  };
}

/** Makes the learner ready to chat with no onboarding: the plan the account already holds, or
 * a plan with no subjects and the starting details, to which the chat adds what the learner
 * asks for. False when the account could not be reached: a plan made then might replace the
 * learner's own. */
export async function readyToChat(): Promise<boolean> {
  if (!(await getCurriculum())) {
    try {
      await syncPlan();
    } catch (error) {
      console.warn("The learner's plan could not be fetched:", error);
      return false;
    }
  }
  if (!(await getCurriculum())) {
    // A learner who did onboarding, whose plan failed, keeps what they said.
    const kept = getUserProfile();
    const learner = kept ?? startingDetails();
    if (!kept) saveUserProfile({ ...learner, preferredSubjects: [] });
    await keepVoiceOnlyPlan(learner);
  }
  saveUserProfile({ onboardingCompleted: true });
  return true;
}
