import {
  currentAccount,
  learnerKeyOf,
  learnerTurn,
} from "@/lib/account/account-store";
import { getCurriculum, holdCurriculum } from "@/lib/curriculum-db";
import type { CurriculumData } from "@/lib/curriculum-record";
import { settleDetailsDue, withDetailsDue } from "@/lib/details-due";
import { followPlan } from "@/lib/follow-plan";
import { pinTo, type LearnerPin } from "@/lib/learner-pin";
import { completedPlan } from "@/lib/plan-details";
import { accountPlan, joinPlan, sendPlan } from "@/lib/shared-plan-api";
import { getUserProfile } from "@/lib/user-storage";

// A learner's devices hold one plan; the server keeps the newer by updatedAt.
// What this device has not sent is its plan differing from the last one the account
// acknowledged, so a save made offline goes with the next sync and needs no queue.

// The account's learner whose plan this device's plan has joined.
const JOINED_KEY = "graspy.plan.joined";
// The plan, by id and date, that this device and the learner last agreed on.
const AGREED_KEY = "graspy.plan.agreed";

function remembered(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage refused: the next sync sends the plan again, which the server takes as is.
  }
}

function forget(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage refused: nothing was remembered.
  }
}

const stamp = (plan: CurriculumData | null) =>
  plan ? `${plan.planId}@${plan.updatedAt}` : "";

type Pin = LearnerPin<string | null>;

function learnerInUse(): string | null {
  const account = currentAccount();
  return account && learnerKeyOf(account);
}

async function joined(
  learner: string,
  local: CurriculumData | null,
  pin: Pin,
): Promise<CurriculumData | null> {
  // Named as the server compares classes, even when no page has completed it yet.
  const held = local
    ? await joinPlan(completedPlan(local, getUserProfile()), pin.holds)
    : await accountPlan(pin.holds);
  pin.hold();
  remember(JOINED_KEY, learner);
  return held;
}

async function pulled(
  local: CurriculumData | null,
  pin: Pin,
): Promise<CurriculumData | null> {
  const account = await accountPlan(pin.holds);
  if (!local) return account;
  if (!account || local.updatedAt > account.updatedAt) {
    return sendPlan(local, pin.holds);
  }
  return account;
}

function exchanged(
  learner: string,
  local: CurriculumData | null,
  pin: Pin,
): Promise<CurriculumData | null> {
  if (remembered(JOINED_KEY) !== learner) return joined(learner, local, pin);
  if (local && remembered(AGREED_KEY) !== stamp(local)) {
    return sendPlan(local, pin.holds);
  }
  return pulled(local, pin);
}

// Details the learner saved after the plan was made go on it, and with the next sync.
async function adopt(
  plan: CurriculumData,
  learner: string,
  pin: Pin,
): Promise<CurriculumData> {
  const taken = withDetailsDue(plan, learner);
  await holdCurriculum(taken);
  pin.hold();
  await followPlan(taken, pin);
  return taken;
}

// Each write on the device waits for the answer before it, so each first asks that the
// device still learns as the learner the sync began for.
async function syncOnce(
  learner: string,
  pin: Pin,
): Promise<CurriculumData | null> {
  pin.hold();
  const local = await getCurriculum();
  const held = await exchanged(learner, local, pin);
  pin.hold();
  if (!held) return null;
  remember(AGREED_KEY, stamp(held));
  settleDetailsDue(held, learner);
  if (stamp(held) === stamp(local)) return null;
  // A save made while the server answered is newer than the answer: the next sync sends it.
  if (stamp(await getCurriculum()) !== stamp(local)) return null;
  pin.hold();
  return adopt(held, learner, pin);
}

const syncFor = (pin: Pin) => (pin.learner ? syncOnce(pin.learner, pin) : null);

// A sync pinned to a learner the device has left holds none back for the next learner, nor
// for the same learner back on the device: it sends nothing more, however long the request
// it is waiting on hangs.
let last: { pin: Pin; done: Promise<unknown> } | null = null;

/** The learner's plan when the device now holds it in place of its own; otherwise null,
 * as when nobody is signed in or no learner is chosen. One sync runs at a time for a
 * learner, and it rejects with LearnerChanged once the device learns as someone else. */
export function syncPlan(): Promise<CurriculumData | null> {
  const pin = pinTo(learnerInUse(), learnerTurn);
  const before = last?.pin.holds() ? last.done : Promise.resolve();
  const run = before.then(() => syncFor(pin));
  last = { pin, done: run.catch(() => undefined) };
  return run;
}

export function forgetPlanSync(): void {
  forget(JOINED_KEY);
  forget(AGREED_KEY);
}
