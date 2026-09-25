import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

import type { NativeInvoke } from "../../academic-workspace/infrastructure/TauriAcademicWorkspaceGateway";
import type { ClassworkGateway } from "../application/ClassworkGateway";
import {
  classworkSectionHistorySchema, classworkWorkspaceSchema,
  type ApproveClassworkVersionRequest, type BeginClassworkSectionRegenerationRequest,
  type EditClassworkBlockRequest, type ClassworkFigureRequest,
  type ClassworkSectionHistoryRequest, type ClassworkWorkspaceRequest,
  type RestoreClassworkSectionRequest, type RunClassworkGenerationRequest,
} from "../domain/classwork";

export class TauriClassworkGateway implements ClassworkGateway {
  constructor(private readonly nativeInvoke: NativeInvoke = invoke) {}
  async getWorkspace(request: ClassworkWorkspaceRequest) { return classworkWorkspaceSchema.parse(await this.nativeInvoke("get_classwork_workspace", { request })); }
  async runGeneration(request: RunClassworkGenerationRequest) {
    return classworkWorkspaceSchema.parse(await this.nativeInvoke("run_classwork_generation", {
      request: { context: request.context, lessonId: request.lessonId, sectionId: request.sectionId ?? null },
    }));
  }
  async regenerateSection(request: BeginClassworkSectionRegenerationRequest) { return classworkWorkspaceSchema.parse(await this.nativeInvoke("regenerate_classwork_section", { request })); }
  /**
   * Work is stopped through the app-wide task registry, under the task id the
   * run carries. Rebuilding that id here was one rule in two languages, and
   * they drifted: a cancel then named a task that did not exist and stopped
   * nothing, with nothing failing to say so.
   */
  async cancelGeneration(taskId: string) {
    await this.nativeInvoke("cancel_background_task", { taskId });
  }
  async editBlock(request: EditClassworkBlockRequest) { return classworkWorkspaceSchema.parse(await this.nativeInvoke("edit_classwork_block", { request })); }
  async approveVersion(request: ApproveClassworkVersionRequest) { return classworkWorkspaceSchema.parse(await this.nativeInvoke("approve_classwork_version", { request })); }
  async getSectionHistory(request: ClassworkSectionHistoryRequest) { return classworkSectionHistorySchema.parse(await this.nativeInvoke("get_classwork_section_history", { request })); }
  async restoreSection(request: RestoreClassworkSectionRequest) { return classworkWorkspaceSchema.parse(await this.nativeInvoke("restore_classwork_section", { request })); }
  async getFigureData(request: ClassworkFigureRequest) {
    const value = await this.nativeInvoke("get_classwork_figure", { request });
    return z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/u).parse(value);
  }
}
