import type {
  CurriculumData,
  CurriculumSubject,
} from "@/lib/curriculum-record";
import { lessonMade, lessonTarget } from "./lesson-app";

// Four times the longest lesson measured on staging (34 s).
export const FIRST_LESSON_LIMIT_MS = 120_000;

/**
 * Makes the plan's first lesson so the first tap opens a ready one. The plan does not wait for it
 * and does not depend on it: a lesson that fails or runs over the limit is made again by the lesson
 * page when the learner opens it. Never rejects; says whether the lesson was made.
 */
export async function prepareFirstLesson(
  plan: CurriculumData,
  subject: CurriculumSubject,
): Promise<boolean> {
  const target = lessonTarget(plan, subject, 0);
  if (!target) return false;
  try {
    await lessonMade(target, FIRST_LESSON_LIMIT_MS);
    return true;
  } catch (error) {
    console.warn("The first lesson was not made ahead:", error);
    return false;
  }
}
