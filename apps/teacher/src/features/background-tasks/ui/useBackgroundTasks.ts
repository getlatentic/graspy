import { useEffect, useSyncExternalStore } from "react";

import type { BackgroundTaskStore } from "../application/BackgroundTaskStore";
import type { LessonContextRequest } from "../../lesson-planning/domain/lessonPlanning";
import type { BackgroundTask } from "../domain/backgroundTask";

/**
 * Subscribes a screen to the app's running work.
 *
 * The store outlives every screen, so this only points it at the class and
 * term on screen and reads from it. Unmounting a screen stops it watching,
 * never stops the work.
 */
export function useBackgroundTasks(
  store: BackgroundTaskStore,
  context: LessonContextRequest,
): readonly BackgroundTask[] {
  const { academicSessionId, academicPeriodId, teachingAssignmentId } = context;
  useEffect(() => {
    store.watch({ academicSessionId, academicPeriodId, teachingAssignmentId });
  }, [store, academicSessionId, academicPeriodId, teachingAssignmentId]);
  return useSyncExternalStore(store.subscribe, store.snapshot);
}
