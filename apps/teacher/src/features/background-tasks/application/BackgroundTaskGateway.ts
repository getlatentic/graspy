import type { LessonContextRequest } from "../../lesson-planning/domain/lessonPlanning";
import type { BackgroundTask } from "../domain/backgroundTask";

/**
 * Where the app reads the work it is doing.
 *
 * Reading is always a read of the record, never of a message that may have
 * been missed: `onChanged` only says the record moved, and the answer comes
 * from `list`. That is what lets a task survive a screen, a reload, or a
 * restart.
 */
export interface BackgroundTaskGateway {
  list(context: LessonContextRequest): Promise<BackgroundTask[]>;
  get(taskId: string): Promise<BackgroundTask | null>;
  cancel(taskId: string): Promise<void>;
  /** Puts ended work away for good. */
  dismiss(taskId: string): Promise<void>;
  /** Picks interrupted work back up where its records left off. */
  resume(task: BackgroundTask, context: LessonContextRequest): Promise<void>;
  onChanged(listener: () => void): Promise<() => void>;
}

/**
 * Whether a task can be picked back up from the bar. Preparation resumes from
 * its saved checkpoints; classwork carries on from the lesson's own workspace,
 * where each section already shows its state.
 */
export function isResumable(task: BackgroundTask): boolean {
  return task.status === "interrupted" && task.kind === "lesson_preparation";
}
