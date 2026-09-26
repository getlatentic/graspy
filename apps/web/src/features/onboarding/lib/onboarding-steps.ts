import { voiceOnly } from "@/lib/voice/voice-learner";
import type { DetailsSchema } from "../schemas/onboarding-schema";
import { learnerDetails } from "./details";

export const STEPS = ["profile", "subjects"] as const;
export type StepKey = (typeof STEPS)[number];

// A class that learns by voice alone has no subjects to choose.
const VOICE_ONLY_STEPS: readonly StepKey[] = ["profile"];

export const stepsFor = (details: DetailsSchema): readonly StepKey[] =>
  voiceOnly(learnerDetails(details)) ? VOICE_ONLY_STEPS : STEPS;

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
