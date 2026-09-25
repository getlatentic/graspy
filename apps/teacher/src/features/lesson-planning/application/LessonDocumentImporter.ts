import { z } from "zod";

/** A lesson plan read out of something the teacher already had. */
export const importedLessonPlanSchema = z.object({
  fileName: z.string(),
  text: z.string(),
});

export type ImportedLessonPlan = z.infer<typeof importedLessonPlanSchema>;

/**
 * Where a lesson plan comes in from a file.
 *
 * `null` means the teacher closed the picker without choosing, which is not a
 * failure and has nothing to say about it. Anything that goes wrong while
 * reading a file they did choose is thrown, because they are owed a reason.
 */
export interface LessonDocumentImporter {
  importPlan(): Promise<ImportedLessonPlan | null>;
}
