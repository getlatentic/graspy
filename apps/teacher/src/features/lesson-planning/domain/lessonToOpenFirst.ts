import type { LessonSummary } from "./lessonPlanning";

/**
 * Which lesson a teacher should land on when they arrive at a class.
 *
 * This week's, because that is the one they are about to teach; failing that
 * the list's first, so arriving at a class taught earlier in the term still
 * lands on work rather than an empty prompt. Nothing at all when there are no
 * lessons — there is nothing to land on, and the start choices are the screen.
 *
 * The week may be unknown, which is not the same as this week having no lesson:
 * a term without dates set cannot say which week is current, and the first
 * lesson is the honest answer rather than a guess at one.
 */
export function lessonToOpenFirst(
  lessons: readonly LessonSummary[],
  currentWeekOrdinal: number | null,
): LessonSummary | null {
  const thisWeek =
    currentWeekOrdinal === null
      ? undefined
      : lessons.find((lesson) => lesson.weekOrdinal === currentWeekOrdinal);
  return thisWeek ?? lessons[0] ?? null;
}
