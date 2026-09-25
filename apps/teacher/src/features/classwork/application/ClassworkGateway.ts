import type {
  ApproveClassworkVersionRequest,
  BeginClassworkSectionRegenerationRequest,
  EditClassworkBlockRequest,
  ClassworkFigureRequest,
  ClassworkSectionHistory,
  ClassworkSectionHistoryRequest,
  ClassworkWorkspaceSnapshot,
  ClassworkWorkspaceRequest,
  RestoreClassworkSectionRequest,
  RunClassworkGenerationRequest,
} from "../domain/classwork";

/**
 * The backend runs generation; this gateway only starts it, watches it, and
 * relays the teacher's edits and decisions. Nothing here holds the work.
 */
export interface ClassworkGateway {
  getWorkspace(request: ClassworkWorkspaceRequest): Promise<ClassworkWorkspaceSnapshot>;
  runGeneration(request: RunClassworkGenerationRequest): Promise<ClassworkWorkspaceSnapshot>;
  regenerateSection(
    request: BeginClassworkSectionRegenerationRequest,
  ): Promise<ClassworkWorkspaceSnapshot>;
  cancelGeneration(taskId: string): Promise<void>;
  getFigureData(request: ClassworkFigureRequest): Promise<string>;
  editBlock(request: EditClassworkBlockRequest): Promise<ClassworkWorkspaceSnapshot>;
  approveVersion(request: ApproveClassworkVersionRequest): Promise<ClassworkWorkspaceSnapshot>;
  getSectionHistory(request: ClassworkSectionHistoryRequest): Promise<ClassworkSectionHistory>;
  restoreSection(request: RestoreClassworkSectionRequest): Promise<ClassworkWorkspaceSnapshot>;
}
