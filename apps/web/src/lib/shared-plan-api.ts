import { ApiError } from "@/lib/api/errors";
import { getJson, sendJson } from "@/lib/api/request";
import type { CurriculumData } from "@/lib/curriculum-record";
import { API_BASE_URL } from "@/lib/env";

// The plan a signed-in learner's devices share (app/api/learner_routes.py).

interface Held {
  plan: CurriculumData | null;
}

const PLAN_URL = `${API_BASE_URL}/learner/curriculum`;

function held({ plan }: Held): CurriculumData {
  if (!plan) throw new ApiError("The server returned no plan", 0);
  return plan;
}

export async function accountPlan(): Promise<CurriculumData | null> {
  return (await getJson<Held>(PLAN_URL)).plan;
}

/** The server keeps the newer plan and returns it: another device's when that is newer. */
export async function sendPlan(plan: CurriculumData): Promise<CurriculumData> {
  return held(await sendJson<Held>(PLAN_URL, "PUT", plan));
}

/** A device's first sign-in: its plan and the account's become one. */
export async function joinPlan(plan: CurriculumData): Promise<CurriculumData> {
  return held(await sendJson<Held>(`${PLAN_URL}/join`, "POST", plan));
}
