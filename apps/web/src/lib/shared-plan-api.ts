import { getJson, sendJson } from "@/lib/api/request";
import type { CurriculumData } from "@/lib/curriculum-record";
import { API_BASE_URL } from "@/lib/env";

// The plan a signed-in learner's devices share (app/api/learner_routes.py). `still`, asked
// as each request is sent, stops it once the session is no longer the learner's it was for.

interface Held {
  plan: CurriculumData | null;
}

const PLAN_URL = `${API_BASE_URL}/learner/curriculum`;

function held({ plan }: Held): CurriculumData {
  if (!plan) throw new Error("The server returned no plan");
  return plan;
}

export async function accountPlan(
  still?: () => boolean,
): Promise<CurriculumData | null> {
  return (await getJson<Held>(PLAN_URL, still)).plan;
}

/** The server keeps the newer plan and returns it: another device's when that is newer. */
export async function sendPlan(
  plan: CurriculumData,
  still?: () => boolean,
): Promise<CurriculumData> {
  return held(await sendJson<Held>(PLAN_URL, "PUT", plan, still));
}

/** A device's first sign-in: its plan and the account's become one. */
export async function joinPlan(
  plan: CurriculumData,
  still?: () => boolean,
): Promise<CurriculumData> {
  return held(await sendJson<Held>(`${PLAN_URL}/join`, "POST", plan, still));
}
