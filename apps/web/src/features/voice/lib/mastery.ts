import type { CatalogueLesson } from "@/lib/voice/voice-types";

/** Days the check must be passed alone before a lesson counts as known (the server's MASTERY_DAYS). */
export const MASTERY_DAYS = 2;

/** Days right that count towards knowing the lesson, never more than the days needed. */
export const daysRight = (lesson: CatalogueLesson) =>
  Math.min(Math.max(lesson.days_correct, 0), MASTERY_DAYS);

/** The lesson the teacher gives next, if the server marked one. */
export const currentLesson = (lessons: CatalogueLesson[]) =>
  lessons.find((lesson) => lesson.current);
