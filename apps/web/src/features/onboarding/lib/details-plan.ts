import { currentAccount, learnerKeyOf } from "@/lib/account/account-store";
import { getCurriculum } from "@/lib/curriculum-db";
import type { CurriculumData } from "@/lib/curriculum-record";
import { keepDetailsDue } from "@/lib/details-due";
import { pinLearner, type LearnerPin } from "@/lib/learner-pin";
import { planDetails } from "@/lib/plan-details";
import { syncPlan } from "@/lib/plan-sync";
import { type LearnerDetails, saveUserProfile } from "@/lib/user-storage";
import { keepVoiceOnlyPlan } from "./generate-plan";

const ACCOUNT_WAIT_MS = 8_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A signed-in device without a plan takes the account's first: a new plan would be
// newer and replace it. Unreached in time, the device cannot know, so it makes none. The
// details are due on whichever plan it takes, then or once the account answers.
async function heldPlan(
  learner: LearnerDetails,
  pause: (ms: number) => Promise<unknown>,
): Promise<CurriculumData | null | undefined> {
  const saved = await getCurriculum();
  const account = currentAccount();
  if (saved || !account) return saved;
  const key = learnerKeyOf(account);
  if (!key) return undefined;
  keepDetailsDue(key, learner);
  const reached = await Promise.race([
    syncPlan().then(
      () => true,
      () => false,
    ),
    pause(ACCOUNT_WAIT_MS).then(() => false),
  ]);
  return reached ? getCurriculum() : undefined;
}

// The wait may outlast the learner: signed out or switched, the device holds the next one.
function keepProfile(learner: LearnerDetails, pin: LearnerPin<string>): void {
  pin.hold();
  saveUserProfile(learner);
}

/** Keeps the learner's new details, and returns the plan they keep: the saved one, now
 * for the learner. With none saved, as after a plan that failed to be made, a class that
 * learns by voice alone is kept a plan of its own, so the learner's other devices find
 * one; any other class has none. Rejects with LearnerChanged, keeping nothing, once the
 * device learns as someone else during the wait. */
export async function keepDetails(
  learner: LearnerDetails,
  voiceOnly: boolean,
  pause: (ms: number) => Promise<unknown> = wait,
): Promise<CurriculumData | null> {
  const pin = pinLearner();
  // Saved after the account's plan is taken, whose details would write over them.
  const held = await heldPlan(learner, pause).finally(() =>
    keepProfile(learner, pin),
  );
  if (held) return { ...held, ...planDetails(learner) };
  return held === null && voiceOnly ? keepVoiceOnlyPlan(learner) : null;
}
