import { z } from "zod";

export const preparationStepSchema = z.enum([
  "learning-goals",
  "prior-knowledge",
  "checks",
  "source-material",
  "teaching-sequence",
  "practice",
  "putting-together",
]);

export const preparationStepStateSchema = z.enum([
  "pending",
  "running",
  "done",
  "failed",
  "stopped",
]);

export const preparationStepProgressSchema = z.object({
  step: preparationStepSchema,
  state: preparationStepStateSchema,
});

export const preparationProgressSchema = z.array(preparationStepProgressSchema);

export type PreparationStep = z.infer<typeof preparationStepSchema>;
export type PreparationStepState = z.infer<typeof preparationStepStateSchema>;
export type PreparationStepProgress = z.infer<typeof preparationStepProgressSchema>;

/**
 * What each step of preparing a lesson is doing, said the way a teacher would
 * say it.
 *
 * The step names come from the program; these words do not. Keeping the
 * wording here means renaming a node never changes what a teacher reads, and
 * changing what they read never touches the program.
 */
const STEP_LABELS: Record<PreparationStep, string> = {
  "learning-goals": "Working out what pupils should learn",
  "prior-knowledge": "Checking what they need to know first",
  checks: "Writing the questions that check understanding",
  "source-material": "Finding the source material to teach from",
  "teaching-sequence": "Writing the teaching sequence",
  practice: "Writing practice for pupils",
  "putting-together": "Putting the lesson together",
};

export function preparationStepLabel(step: PreparationStep): string {
  return STEP_LABELS[step];
}

export function preparationStepsDone(
  progress: readonly PreparationStepProgress[],
): number {
  return progress.filter(({ state }) => state === "done").length;
}
