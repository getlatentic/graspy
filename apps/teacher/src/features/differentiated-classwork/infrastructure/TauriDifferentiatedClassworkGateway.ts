import { invoke } from "@tauri-apps/api/core";

import type { NativeInvoke } from "../../academic-workspace/infrastructure/TauriAcademicWorkspaceGateway";
import type { DifferentiatedClassworkGateway } from "../application/DifferentiatedClassworkGateway";
import {
  differentiatedClassworkWorkspaceSchema,
  type DifferentiatedWorkspaceRequest,
  type RunDifferentiatedGenerationRequest,
} from "../domain/differentiatedClasswork";

export class TauriDifferentiatedClassworkGateway implements DifferentiatedClassworkGateway {
  constructor(private readonly nativeInvoke: NativeInvoke = invoke) {}

  async getWorkspace(request: DifferentiatedWorkspaceRequest) {
    return differentiatedClassworkWorkspaceSchema.parse(
      await this.nativeInvoke("get_differentiated_classwork_workspace", { request }),
    );
  }

  async runGeneration(request: RunDifferentiatedGenerationRequest) {
    return differentiatedClassworkWorkspaceSchema.parse(
      await this.nativeInvoke("run_differentiated_classwork_generation", {
        request: { context: request.context, lessonId: request.lessonId, sectionId: request.sectionId ?? null },
      }),
    );
  }

  /** Work is stopped through the app-wide task registry, under the run's task id. */
  async cancelGeneration(taskId: string) {
    await this.nativeInvoke("cancel_background_task", { taskId });
  }
}
