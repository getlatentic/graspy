import type { Dispatch } from "react";
import { voiceOnly } from "@/lib/voice/voice-learner";
import type { GeneratedSubject } from "../types";
import type { OnboardingSchema } from "../schemas/onboarding-schema";
import { learnerDetails } from "./details";
import type { GenerationStats } from "./generate-plan";

export const GENERATION_STEP_SEQUENCE = [
  "analyzing",
  "generating",
  "personalizing",
] as const;

export type GenerationTimelineStep = (typeof GENERATION_STEP_SEQUENCE)[number];

export interface PlanSetupState {
  /** A class that learns by voice alone has its plan kept at once, with no wait. */
  phase: "form" | "generating" | "ready" | "kept";
  step: GenerationTimelineStep;
  stats: GenerationStats | null;
  error: string | null;
}

export type PlanSetupEvent =
  | { type: "started" }
  | { type: "paced"; index: number }
  | { type: "made"; stats: GenerationStats }
  | { type: "saved" }
  | { type: "failed"; error: string }
  | { type: "kept" }
  | { type: "reset" };

export const FORM_SHOWN: PlanSetupState = {
  phase: "form",
  step: "analyzing",
  stats: null,
  error: null,
};

/** The timeline is paced on a timer and never moves back. */
export function planSetupReducer(
  state: PlanSetupState,
  event: PlanSetupEvent,
): PlanSetupState {
  switch (event.type) {
    case "started":
      return { ...FORM_SHOWN, phase: "generating" };
    case "paced":
      return GENERATION_STEP_SEQUENCE.indexOf(state.step) < event.index
        ? { ...state, step: GENERATION_STEP_SEQUENCE[event.index] }
        : state;
    case "made":
      return { ...state, stats: event.stats };
    case "saved":
      return { ...state, step: "personalizing", phase: "ready" };
    case "failed":
      return { ...state, error: event.error };
    case "kept":
      return { ...FORM_SHOWN, phase: "kept" };
    case "reset":
      return FORM_SHOWN;
  }
}

/** A class that learns by voice alone keeps its plan at once; any other has one made
 * from its subjects. */
export function startSetup<T>(
  data: OnboardingSchema,
  run: { keep: () => T; make: () => T },
): T {
  return voiceOnly(learnerDetails(data)) ? run.keep() : run.make();
}

/** A plan kept at once leaves the form once kept, and stays on it, saying so, when not. */
export async function keepAtOnce(
  keep: () => Promise<void>,
  dispatch: Dispatch<PlanSetupEvent>,
): Promise<void> {
  dispatch({ type: "reset" });
  try {
    await keep();
    dispatch({ type: "kept" });
  } catch (e) {
    console.error("Keeping the plan failed:", e);
    dispatch({
      type: "failed",
      error: e instanceof Error ? e.message : "Error",
    });
  }
}

export function planRequest(
  data: OnboardingSchema,
  available: readonly GeneratedSubject[],
) {
  const subjects = data.selectedSubjects
    .map((id) => available.find((subject) => subject.id === id)?.label)
    .filter((label): label is string => Boolean(label));
  return {
    country: data.country,
    language: data.language,
    gradeLevel: learnerDetails(data).gradeLevel,
    subjects,
  };
}
