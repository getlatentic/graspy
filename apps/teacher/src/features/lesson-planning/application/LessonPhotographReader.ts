import { z } from "zod";

/** A lesson plan read off a photograph, with the page it was read from. */
export const lessonPlanPhotographSchema = z.object({
  fileName: z.string(),
  text: z.string(),
  /** The page as a data URL, to sit beside the words for checking. */
  page: z.string(),
});

export type LessonPlanPhotograph = z.infer<typeof lessonPlanPhotographSchema>;

/**
 * Where a lesson plan comes in from a photograph of the page it is written on.
 *
 * Reading one runs the engine over the page a band at a time and takes the
 * better part of a minute, which is why this can be stopped and a file import
 * cannot. `null` means the teacher closed the picker without choosing, which is
 * not a failure and has nothing to say about it.
 */
export interface LessonPhotographReader {
  /** Whether this machine has what reading a photograph takes. */
  canRead(): Promise<boolean>;
  readPlan(): Promise<LessonPlanPhotograph | null>;
  stopReading(): Promise<void>;
}
