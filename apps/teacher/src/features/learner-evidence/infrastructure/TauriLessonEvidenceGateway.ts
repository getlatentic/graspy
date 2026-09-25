import { invoke } from "@tauri-apps/api/core";

import type { NativeInvoke } from "../../academic-workspace/infrastructure/TauriAcademicWorkspaceGateway";
import type { LessonEvidenceGateway } from "../application/LessonEvidenceGateway";
import {
  lessonEvidenceWorkspaceSchema,
  type LessonEvidenceWorkspaceRequest,
  type SaveLessonEvidenceRequest,
} from "../domain/lessonEvidence";

export class TauriLessonEvidenceGateway implements LessonEvidenceGateway {
  constructor(private readonly nativeInvoke: NativeInvoke = invoke) {}

  async getWorkspace(request: LessonEvidenceWorkspaceRequest) {
    return lessonEvidenceWorkspaceSchema.parse(await this.nativeInvoke("get_lesson_evidence_workspace", { request }));
  }

  async save(request: SaveLessonEvidenceRequest) {
    return lessonEvidenceWorkspaceSchema.parse(await this.nativeInvoke("save_lesson_evidence", { request }));
  }
}
