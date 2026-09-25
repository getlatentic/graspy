import { z } from "zod";

import type { PreparationStepProgress } from "./preparationProgress";

const preparedLessonStepSchema = z.object({
  title: z.string().trim().min(1).max(160),
  teacherActivity: z.string().trim().min(1).max(2_000),
  learnerActivity: z.string().trim().min(1).max(2_000),
  durationMinutes: z.number().int().min(1).max(240).nullable(),
});

export const generatedLessonPreparationSchema = z.object({
  topic: z.string().trim().min(1).max(160),
  subtopic: z.string().max(160),
  learningGoals: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
  steps: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        teacherActivity: z.string().trim().min(1).max(2_000),
        learnerActivity: z.string().trim().min(1).max(2_000),
        durationMinutes: z.number().int().min(0).max(240),
      }),
    )
    .min(1)
    .max(20),
  instructionalMaterials: z.array(z.string().trim().min(1).max(300)).max(30),
  assessment: z.array(z.string().trim().min(1).max(500)).max(20),
  references: z.array(z.string().trim().min(1).max(500)).max(30),
});

export const preparedLessonSchema = z.object({
  topic: z.string().trim().min(1).max(160),
  subtopic: z.string().trim().min(1).max(160).nullable(),
  learningGoals: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
  steps: z.array(preparedLessonStepSchema).min(1).max(20),
  instructionalMaterials: z.array(z.string().trim().min(1).max(300)).max(30),
  assessment: z.array(z.string().trim().min(1).max(500)).max(20),
  references: z.array(z.string().trim().min(1).max(500)).max(30),
});

export type PreparedLesson = z.infer<typeof preparedLessonSchema>;

export interface PastedLessonSource {
  readonly lessonId: string;
  readonly topic: string;
  readonly rawPlan: string;
}

/**
 * Where a lesson's preparation run stands, as the screen watches it.
 *
 * Cancellation, failure and success are distinct states, and each carries the
 * lesson it is about — a run's report can never be read against the wrong one.
 */
export type LessonPreparationState =
  | { readonly status: "idle" }
  | {
      readonly status: "preparing";
      readonly lessonId: string;
      readonly progress: readonly PreparationStepProgress[];
    }
  | { readonly status: "failed"; readonly lessonId: string; readonly message: string }
  | { readonly status: "cancelled"; readonly lessonId: string };
