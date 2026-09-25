import type { GranularLessonRecord } from "./granularLesson";
import type { LessonDraft } from "./lessonPlanning";

/**
 * What a lesson already has written, read from the lesson alone.
 *
 * Pure: these are questions about a lesson, not about a screen, and they were
 * computed inline where a reader had to hold five clauses in their head to
 * answer "does this lesson have a plan yet". Keeping them here means the
 * answers can be checked without rendering anything.
 */

/** The detailed plan a lesson carries, whichever way it was written. */
export function granularRecordOf(lesson: LessonDraft | null): GranularLessonRecord | null {
  if (!lesson || lesson.status !== "draft") return null;
  return lesson.preparation?.granularRecord ?? lesson.granularRecord ?? null;
}

/** The lesson as its teacher wrote it by hand, when it was written by hand. */
export function authoredContentOf(lesson: LessonDraft | null) {
  return lesson?.status === "draft" ? lesson.authoredContent ?? null : null;
}

/**
 * Whether a lesson has a plan at all.
 *
 * A lesson has one once it is prepared, authored, confirmed, or written by hand
 * into a teaching sequence. Before that it is the same as an untouched scheme
 * entry, and reads that way rather than as a half-page with a Prepare button.
 */
export function hasPlan(lesson: LessonDraft | null): boolean {
  if (!lesson) return false;
  return (
    lesson.status === "confirmed" ||
    granularRecordOf(lesson) !== null ||
    authoredContentOf(lesson) !== null ||
    lesson.steps.length > 0 ||
    // A pasted plan is content to prepare from, not an empty lesson.
    (lesson.rawPlan?.trim().length ?? 0) > 0
  );
}

/**
 * Whether a lesson is waiting for someone to give it a plan.
 *
 * A preparation under way is not waiting — the run is the answer, and offering
 * the three ways to start beside it would ask the teacher to start again.
 */
export function awaitsPlan(lesson: LessonDraft | null, preparing: boolean): boolean {
  return lesson !== null && !hasPlan(lesson) && !preparing;
}
