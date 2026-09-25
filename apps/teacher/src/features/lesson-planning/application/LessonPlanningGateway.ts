import type {
  ConfirmGranularLessonRequest,
  DiscardLessonRequest,
  GranularLessonProgramInput,
  GranularLessonProgramInputRequest,
  LessonWorkspaceRequest,
  LessonWorkspaceSnapshot,
  MoveLessonDraftRequest,
  SaveLessonDraftRequest,
  SaveAuthoredLessonRequest,
  SaveGranularLessonRequest,
  SaveStudentNoteRequest,
} from "../domain/lessonPlanning";

export interface LessonPlanningGateway {
  getWorkspace(request: LessonWorkspaceRequest): Promise<LessonWorkspaceSnapshot>;
  saveDraft(request: SaveLessonDraftRequest): Promise<LessonWorkspaceSnapshot>;
  saveAuthoredLesson(
    request: SaveAuthoredLessonRequest,
  ): Promise<LessonWorkspaceSnapshot>;
  getGranularProgramInput(
    request: GranularLessonProgramInputRequest,
  ): Promise<GranularLessonProgramInput>;
  saveGranularLesson(
    request: SaveGranularLessonRequest,
  ): Promise<LessonWorkspaceSnapshot>;
  confirmGranularLesson(
    request: ConfirmGranularLessonRequest,
  ): Promise<LessonWorkspaceSnapshot>;
  moveDraft(request: MoveLessonDraftRequest): Promise<LessonWorkspaceSnapshot>;
  discardLesson(request: DiscardLessonRequest): Promise<LessonWorkspaceSnapshot>;
  saveStudentNote(request: SaveStudentNoteRequest): Promise<void>;
}
