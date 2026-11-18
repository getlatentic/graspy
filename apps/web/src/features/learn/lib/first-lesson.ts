import type {
  CurriculumData,
  CurriculumSubject,
} from "@/lib/curriculum-record";
import { lessonMade, lessonTarget } from "./lesson-app";

// Four times the longest lesson measured on staging (34 s).
export const FIRST_LESSON_LIMIT_MS = 120_000;

/**
 * Makes the plan's first lesson so the first tap opens a ready one. The plan does not wait for it
 * and does not depend on it: a lesson that fails, runs over the limit or is stopped is made again
 * by the lesson page when the learner opens it (the server answers that page from the lesson it
 * already holds). Never rejects; says whether the lesson was made.
 */
export async function prepareFirstLesson(
  plan: CurriculumData,
  subject: CurriculumSubject,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const target = lessonTarget(plan, subject, 0);
    if (!target) return false;
    await lessonMade(target, { limitMs: FIRST_LESSON_LIMIT_MS, signal });
    return true;
  } catch (error) {
    if (!signal?.aborted) {
      console.warn("The first lesson was not made ahead:", error);
    }
    return false;
  }
}
