import type { BackgroundTaskStore } from "../application/BackgroundTaskStore";
import type { LessonContextRequest } from "../../lesson-planning/domain/lessonPlanning";
import { workUnderWay, type BackgroundTask } from "../domain/backgroundTask";
import { useBackgroundTasks } from "./useBackgroundTasks";

/**
 * The work already under way for one lesson, so the screen that would offer to
 * start it can show what is happening instead.
 *
 * A teacher who opens a lesson has no way of knowing what they set going ten
 * minutes ago on another screen, and asking for it twice would put two of the
 * same job in the queue. The app already knows — this is how a screen asks.
 *
 * `null` means nothing of this kind is under way for this lesson and the
 * control should offer to start it.
 */
export function useWorkUnderWay(
  store: BackgroundTaskStore,
  context: LessonContextRequest,
  lessonId: string | null,
  kind: string,
): BackgroundTask | null {
  const tasks = useBackgroundTasks(store, context);
  return lessonId === null ? null : workUnderWay(tasks, lessonId, kind);
}
