import {
  currentAccount,
  type Account,
  type Learner,
} from "@/lib/account/account-store";
import {
  keepLearnerSession,
  leaveLearnerSession,
  type Issued,
} from "@/lib/api/session";
import { getCurriculum } from "@/lib/curriculum-db";
import { deviceId } from "@/lib/device-id";
import { wipeLearnerData } from "@/lib/device-wipe";
import { sentEverything } from "@/lib/mcp/outbox";
import { syncPlan } from "@/lib/plan-sync";
import { wipeOnNextStart } from "@/lib/wipe-pending";
import { saveUserProfile } from "@/lib/user-storage";
import { sentEveryAnswer } from "@/lib/voice/answer-outbox";
import { voiceLearnerKey } from "@/lib/voice/voice-learner-key";
import { learnerSession, removeLearner } from "./learners-api";

// Which of the account's learners the device learns as. The first chosen after signing in
// takes the device's plan and progress; any other starts from a wiped device.

/** Refused so that nothing unsent is lost. Offline the switch cannot be made; online it is
 * made when asked for once more with loseUnsent. */
export class UnsentChanges extends Error {
  readonly offline: boolean;

  constructor(offline: boolean) {
    super(
      offline
        ? "Connect to the internet first, so nothing is lost"
        : "Some changes haven't been sent",
    );
    this.name = "UnsentChanges";
    this.offline = offline;
  }
}

export interface ChoiceOptions {
  /** Switches even though what the device holds for its learner has not all been sent. */
  loseUnsent?: boolean;
}

// A spoken answer may take minutes to mark; past this the learner is asked instead of kept waiting.
const FLUSH_MS = 20_000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sentAll(): Promise<boolean> {
  try {
    await syncPlan();
    const learner = voiceLearnerKey();
    const sent = await Promise.all([
      sentEverything(),
      !learner || sentEveryAnswer(learner),
    ]);
    return sent.every(Boolean);
  } catch {
    return false;
  }
}

/** Whether everything the device holds for its learner has reached the server: the plan,
 * the views' calls and the spoken answers. False once it has taken too long. */
export async function flushUnsent(
  pause: (ms: number) => Promise<unknown> = wait,
): Promise<boolean> {
  if (!navigator.onLine) return false;
  return Promise.race([sentAll(), pause(FLUSH_MS).then(() => false)]);
}

/** The device keeps nothing of the learner in use, and has none chosen. The learner goes
 * first: what is still in flight for them, pinned to them, then sends and writes nothing
 * more, so nothing of theirs comes back after the wipe. */
export async function leaveLearner(): Promise<void> {
  leaveLearnerSession();
  await wipeLearnerData();
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
async function takeUp(session: Issued): Promise<void> {
  keepLearnerSession(session);
  try {
    await syncPlan();
  } catch (error) {
    leaveLearnerSession();
    throw error;
  }
}

async function switchFrom(
  account: Account,
  learner: Learner,
  { loseUnsent = false }: ChoiceOptions,
): Promise<void> {
  if (account.learner && !loseUnsent && !(await flushUnsent())) {
    throw new UnsentChanges(!navigator.onLine);
  }
  // Issued before the wipe, so a switch graspy cannot make leaves the device as it was.
  const session = await learnerSession(learner.id);
  await leaveLearner();
  await takeUp(session);
}

/** Chooses who is learning on this device, and returns the page they start on. */
export async function chooseLearner(
  learner: Learner,
  options: ChoiceOptions = {},
): Promise<string> {
  const account = currentAccount();
  if (!account) throw new Error("Sign in to choose a learner");
  if (account.learner?.id !== learner.id) {
    if (account.deviceJoins) await joinFirst(learner);
    else await switchFrom(account, learner, options);
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
