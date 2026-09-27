import type { DetailsSchema } from "../schemas/onboarding-schema";
import { learnsByVoiceAlone } from "./details";

export const STEPS = ["profile", "subjects"] as const;
export type StepKey = (typeof STEPS)[number];

// A class that learns by voice alone has no subjects to choose.
const VOICE_ONLY_STEPS: readonly StepKey[] = ["profile"];

export const stepsFor = (details: DetailsSchema): readonly StepKey[] =>
  learnsByVoiceAlone(details, false) ? VOICE_ONLY_STEPS : STEPS;

/** Whether the form shows that the plan stopped: only a class that learns by voice alone
 * keeps its plan from the form, so a failure is no longer news once another class is chosen. */
export const notKeptAtOnce = (
  failed: boolean,
  details: DetailsSchema,
): boolean => failed && learnsByVoiceAlone(details, false);

/** The last step's button tries again once its plan was not kept. */
export function nextLabelKey(
  busy: boolean,
  isLast: boolean,
  failed: boolean,
): string {
  if (busy) return "onboarding.settingUp";
  if (failed) return "onboarding.generating.tryAgain";
  return isLast ? "onboarding.start" : "onboarding.next";
}
