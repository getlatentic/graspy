import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { NativeInvoke } from "../../academic-workspace/infrastructure/TauriAcademicWorkspaceGateway";
import type { LessonContextRequest } from "../../lesson-planning/domain/lessonPlanning";
import type { BackgroundTaskGateway } from "../application/BackgroundTaskGateway";
import { backgroundTaskSchema, type BackgroundTask } from "../domain/backgroundTask";

const TASKS_CHANGED_EVENT = "background-tasks-changed";

type NativeListen = (event: string, handler: () => void) => Promise<() => void>;

const tauriListen: NativeListen = (event, handler) =>
  listen(event, () => handler());

export class TauriBackgroundTaskGateway implements BackgroundTaskGateway {
  constructor(
    private readonly nativeInvoke: NativeInvoke = invoke,
    private readonly nativeListen: NativeListen = tauriListen,
  ) {}

  async list(context: LessonContextRequest): Promise<BackgroundTask[]> {
    return backgroundTaskSchema
      .array()
      .parse(await this.nativeInvoke<unknown>("list_background_tasks", { context }));
  }

  async get(taskId: string): Promise<BackgroundTask | null> {
    const task = await this.nativeInvoke<unknown>("get_background_task", { taskId });
    return task === null ? null : backgroundTaskSchema.parse(task);
  }

  async cancel(taskId: string): Promise<void> {
    await this.nativeInvoke<null>("cancel_background_task", { taskId });
  }

  async dismiss(taskId: string): Promise<void> {
    await this.nativeInvoke<null>("dismiss_background_task", { taskId });
  }

  async resume(task: BackgroundTask, context: LessonContextRequest): Promise<void> {
    await this.nativeInvoke("resume_lesson_preparation", {
      request: { context, taskId: task.id },
    });
  }

  onChanged(listener: () => void): Promise<() => void> {
    return this.nativeListen(TASKS_CHANGED_EVENT, listener);
  }
}
