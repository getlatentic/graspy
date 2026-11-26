import { getCurriculum, saveCurriculum } from "@/lib/curriculum-db";
import { planDetails } from "@/lib/plan-details";
import { syncPlan } from "@/lib/plan-sync";
import {
  getUserProfile,
  saveUserProfile,
  type LearnerDetails,
} from "@/lib/user-storage";

/** English, the language lessons are in, and no country or class: the chat asks both on one
 * form, and keeps them once the learner has answered. A country the device guessed is only
 * where the form starts (tutor-context.ts), never kept as if the learner had said it. */
function startingDetails(): LearnerDetails {
  return {
    country: "",
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
 * asks for. False, making nothing, when the account could not be reached (a plan made then
 * might replace the learner's own), and for a learner who has said their class but has no
 * plan: the app's own plan loading makes theirs. */
async function makeReady(): Promise<boolean> {
  if (!(await getCurriculum())) {
    try {
      await syncPlan();
    } catch (error) {
      console.warn("The learner's plan could not be fetched:", error);
      return false;
    }
  }
  if (!(await getCurriculum())) {
    const kept = getUserProfile();
    if (kept?.gradeLevel) return false;
    // A profile with no class was made here, and its country is a guess an earlier open kept.
    const learner = { ...(kept ?? startingDetails()), country: "" };
    if (!kept || kept.country)
      saveUserProfile({ ...learner, preferredSubjects: [] });
    await saveCurriculum({
      ...planDetails(learner),
      subjects: [],
      topics: {},
      assessment: { nextSubject: null },
      startedInChat: true,
    });
  }
  saveUserProfile({ onboardingCompleted: true });
  return true;
}

let making: Promise<boolean> | null = null;

/** One at a time: two opens of the link share the plan one of them makes, as each would
 * otherwise find none and make its own. */
export function readyToChat(): Promise<boolean> {
  making ??= makeReady().finally(() => {
    making = null;
  });
  return making;
}
