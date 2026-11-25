import { getCurriculum, saveCurriculum } from "@/lib/curriculum-db";
import { detectLocale } from "@/lib/locale-detector";
import { planDetails } from "@/lib/plan-details";
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
    const learner = kept ?? startingDetails();
    if (!kept) saveUserProfile({ ...learner, preferredSubjects: [] });
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
