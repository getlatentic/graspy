import { invoke } from "@tauri-apps/api/core";

import type { NativeInvoke } from "../../academic-workspace/infrastructure/TauriAcademicWorkspaceGateway";
import type { LessonPlanningGateway } from "../application/LessonPlanningGateway";
import {
  granularLessonProgramInputSchema,
  type GranularLessonProgramInput,
} from "../domain/granularLesson";
import {
  lessonWorkspaceSnapshotSchema,
  type ConfirmGranularLessonRequest,
  type DiscardLessonRequest,
  type GranularLessonProgramInputRequest,
  type LessonWorkspaceRequest,
  type LessonWorkspaceSnapshot,
  type MoveLessonDraftRequest,
  type SaveLessonDraftRequest,
  type SaveAuthoredLessonRequest,
  type SaveGranularLessonRequest,
  type SaveStudentNoteRequest,
} from "../domain/lessonPlanning";

export class TauriLessonPlanningGateway implements LessonPlanningGateway {
  constructor(private readonly nativeInvoke: NativeInvoke = invoke) {}

  getWorkspace(request: LessonWorkspaceRequest): Promise<LessonWorkspaceSnapshot> {
    return this.call("get_lesson_workspace", { request });
  }

  saveDraft(request: SaveLessonDraftRequest): Promise<LessonWorkspaceSnapshot> {
    return this.call("save_lesson_draft", { request });
  }

  saveAuthoredLesson(
    request: SaveAuthoredLessonRequest,
  ): Promise<LessonWorkspaceSnapshot> {
    return this.call("save_authored_lesson", { request });
  }

  async getGranularProgramInput(
    request: GranularLessonProgramInputRequest,
  ): Promise<GranularLessonProgramInput> {
    try {
      return await this.loadGranularProgramInput(request);
    } catch (error) {
      // A lesson the teacher wrote themselves has no curriculum behind it, so
      // the first time it is prepared its goals are worked through to find what
      // it teaches against. That is part of preparing it, not a separate errand
      // to send the teacher on.
      if (!needsGoalsWorkedThrough(error)) throw error;
      await this.nativeInvoke<null>("work_through_teacher_lesson_goals", {
        requestId: crypto.randomUUID(),
        request: { context: request.context, lessonId: request.lessonId },
      });
      return await this.loadGranularProgramInput(request);
    }
  }

  private async loadGranularProgramInput(
    request: GranularLessonProgramInputRequest,
  ): Promise<GranularLessonProgramInput> {
    return granularLessonProgramInputSchema.parse(
      await this.nativeInvoke<unknown>("get_granular_lesson_program_input", {
        request,
      }),
    );
  }

  saveGranularLesson(
    request: SaveGranularLessonRequest,
  ): Promise<LessonWorkspaceSnapshot> {
    return this.call("save_granular_lesson", { request });
  }

  confirmGranularLesson(
    request: ConfirmGranularLessonRequest,
  ): Promise<LessonWorkspaceSnapshot> {
    return this.call("confirm_granular_lesson", { request });
  }

  moveDraft(request: MoveLessonDraftRequest): Promise<LessonWorkspaceSnapshot> {
    return this.call("move_lesson_draft", { request });
  }

  discardLesson(request: DiscardLessonRequest): Promise<LessonWorkspaceSnapshot> {
    return this.call("discard_lesson", { request });
  }

  async saveStudentNote(request: SaveStudentNoteRequest): Promise<void> {
    await this.nativeInvoke<null>("save_lesson_note", {
      context: request.context,
      lessonId: request.lessonId,
      paragraphs: request.note.paragraphs,
      writtenFromVersion: request.note.writtenFromVersion,
    });
  }


  private async call(
    command: string,
    args: Record<string, unknown>,
  ): Promise<LessonWorkspaceSnapshot> {
    return lessonWorkspaceSnapshotSchema.parse(
      await this.nativeInvoke<unknown>(command, args),
    );
  }
}

// The lesson has no curriculum behind it yet and its goals have not been worked
// through, or were worked through against goals the teacher has since changed.
function needsGoalsWorkedThrough(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("needs its learning goals worked through") ||
    message.includes("learning goals changed")
  );
}
