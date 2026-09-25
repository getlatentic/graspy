import type { LessonLaunch, WorkspaceLesson } from "./lessonPlanning";

/**
 * The weekly plan a lesson was written for, when it was written for one.
 *
 * Both halves or neither: a lesson pinned to a week but not to an entry in it
 * has nowhere to return to, so it is treated as belonging to no plan.
 */
export function launchFor(lesson: WorkspaceLesson): LessonLaunch | null {
  return lesson.schemeWeekId && lesson.schemeEntryId
    ? { schemeWeekId: lesson.schemeWeekId, schemeEntryId: lesson.schemeEntryId }
    : null;
}
