import {
  currentAccount,
  type Account,
  type Learner,
} from "@/lib/account/account-store";
import { keepLearnerSession, leaveLearnerSession } from "@/lib/api/session";
import { getCurriculum } from "@/lib/curriculum-db";
import { deviceId } from "@/lib/device-id";
import { wipeLearnerData } from "@/lib/device-wipe";
import { sentEverything } from "@/lib/mcp/outbox";
import { syncPlan } from "@/lib/plan-sync";
import { wipeOnNextStart } from "@/lib/wipe-pending";
import { saveUserProfile } from "@/lib/user-storage";
import { learnerSession, removeLearner } from "./learners-api";

// Which of the account's learners the device learns as. The first chosen after signing in
// takes the device's plan and progress; any other starts from a wiped device.

/** Refused so that nothing unsent is lost: the device must reach the server first. */
export class UnsentChanges extends Error {
  constructor() {
    super("Connect to the internet first, so nothing is lost");
    this.name = "UnsentChanges";
  }
}

/** Whether everything the device holds for its learner has reached the server. */
export async function flushUnsent(): Promise<boolean> {
  if (!navigator.onLine) return false;
  try {
    await syncPlan();
    return await sentEverything();
  } catch {
    return false;
  }
}

/** The device keeps nothing of the learner in use, and has none chosen. */
export async function leaveLearner(): Promise<void> {
  await wipeLearnerData();
  leaveLearnerSession();
}

/** Where the learner starts: their plan, or onboarding to make one. */
async function startPage(): Promise<string> {
  if (!(await getCurriculum())) return "/app/onboarding";
  saveUserProfile({ onboardingCompleted: true });
  return "/app/learn";
}

async function joinFirst(learner: Learner): Promise<void> {
  keepLearnerSession(await learnerSession(learner.id, deviceId()));
  await syncPlan().catch((error: unknown) =>
    console.warn("Joining the device's plan failed; it joins later:", error),
  );
}

// Wiped, the device must get the learner's plan: without it the learner would make a new
// one, which would replace theirs.
async function takeUp(learner: Learner): Promise<void> {
  keepLearnerSession(await learnerSession(learner.id));
  try {
    await syncPlan();
  } catch (error) {
    leaveLearnerSession();
    throw error;
  }
}

async function switchFrom(account: Account, learner: Learner): Promise<void> {
  if (account.learner && !(await flushUnsent())) throw new UnsentChanges();
  await leaveLearner();
  await takeUp(learner);
}

/** Chooses who is learning on this device, and returns the page they start on. */
export async function chooseLearner(learner: Learner): Promise<string> {
  const account = currentAccount();
  if (!account) throw new Error("Sign in to choose a learner");
  if (account.learner?.id !== learner.id) {
    if (account.deviceJoins) await joinFirst(learner);
    else await switchFrom(account, learner);
  }
  return startPage();
}

/** The learner in use is gone from the account: nothing of them stays, even what a
 * request in flight writes back. */
export async function leaveForGood(): Promise<void> {
  await leaveLearner();
  wipeOnNextStart("learner");
}

/** Removes a learner from the account; the device leaves them if they were in use. */
export async function forgetLearner(id: string): Promise<boolean> {
  await removeLearner(id);
  const inUse = currentAccount()?.learner?.id === id;
  if (inUse) await leaveForGood();
  return inUse;
}
