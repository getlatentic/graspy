import type {
  LessonEvidenceWorkspaceRequest,
  LessonEvidenceWorkspaceSnapshot,
  SaveLessonEvidenceRequest,
} from "../domain/lessonEvidence";

export interface LessonEvidenceGateway {
  getWorkspace(request: LessonEvidenceWorkspaceRequest): Promise<LessonEvidenceWorkspaceSnapshot>;
  save(request: SaveLessonEvidenceRequest): Promise<LessonEvidenceWorkspaceSnapshot>;
}
