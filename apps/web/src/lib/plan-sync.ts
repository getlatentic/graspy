import { currentAccount, learnerKeyOf } from "@/lib/account/account-store";
import { getCurriculum, holdCurriculum } from "@/lib/curriculum-db";
import type { CurriculumData } from "@/lib/curriculum-record";
import { followPlan } from "@/lib/follow-plan";
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

async function joined(
  learner: string,
  local: CurriculumData | null,
): Promise<CurriculumData | null> {
  // Named as the server compares classes, even when no page has completed it yet.
  const held = local
    ? await joinPlan(completedPlan(local, getUserProfile()))
    : await accountPlan();
  remember(JOINED_KEY, learner);
  return held;
}

async function pulled(
  local: CurriculumData | null,
): Promise<CurriculumData | null> {
  const account = await accountPlan();
  if (!local) return account;
  if (!account || local.updatedAt > account.updatedAt) return sendPlan(local);
  return account;
}

function exchanged(
  learner: string,
  local: CurriculumData | null,
): Promise<CurriculumData | null> {
  if (remembered(JOINED_KEY) !== learner) return joined(learner, local);
  if (local && remembered(AGREED_KEY) !== stamp(local)) return sendPlan(local);
  return pulled(local);
}

async function adopt(plan: CurriculumData): Promise<void> {
  await holdCurriculum(plan);
  await followPlan(plan);
}

async function syncOnce(learner: string): Promise<CurriculumData | null> {
  const local = await getCurriculum();
  const held = await exchanged(learner, local);
  if (!held) return null;
  remember(AGREED_KEY, stamp(held));
  if (stamp(held) === stamp(local)) return null;
  // A save made while the server answered is newer than the answer: the next sync sends it.
  if (stamp(await getCurriculum()) !== stamp(local)) return null;
  await adopt(held);
  return held;
}

let queue: Promise<unknown> = Promise.resolve();

/** The learner's plan when the device now holds it in place of its own; otherwise null,
 * as when nobody is signed in or no learner is chosen. One sync runs at a time. */
export function syncPlan(): Promise<CurriculumData | null> {
  const run = queue.then(() => {
    const account = currentAccount();
    const learner = account && learnerKeyOf(account);
    return learner ? syncOnce(learner) : null;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function forgetPlanSync(): void {
  forget(JOINED_KEY);
  forget(AGREED_KEY);
}
