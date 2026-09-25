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
  phase: "form" | "generating" | "ready";
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
    case "reset":
      return FORM_SHOWN;
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
