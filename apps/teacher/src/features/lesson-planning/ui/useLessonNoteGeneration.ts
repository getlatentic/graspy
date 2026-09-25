import { useRef, useState } from "react";

import {
  NoteGenerationCancelledError,
  type LessonNoteGenerator,
  type StudentNoteJob,
} from "../application/LessonNoteGenerator";
import type { LessonPlanningGateway } from "../application/LessonPlanningGateway";
import type { LessonContextRequest, StudentNote } from "../domain/lessonPlanning";

/**
 * The note a lesson has in this session, and whether one is being written.
 *
 * The generated note lives here as the live source while the app is open;
 * persistence writes it through so a reload finds it on the lesson itself.
 */
export interface LessonNoteState {
  readonly status: "idle" | "generating" | "failed";
  readonly note: StudentNote | null;
  readonly message: string | null;
}

const IDLE: LessonNoteState = { status: "idle", note: null, message: null };

export function useLessonNoteGeneration(
  gateway: LessonPlanningGateway,
  generator: LessonNoteGenerator,
  context: LessonContextRequest,
) {
  const [states, setStates] = useState<Record<string, LessonNoteState>>({});
  const active = useRef<Map<string, AbortController>>(new Map());
  const { academicSessionId, academicPeriodId, teachingAssignmentId } = context;

  const stateFor = (lessonId: string): LessonNoteState => states[lessonId] ?? IDLE;

  const update = (lessonId: string, next: LessonNoteState) => {
    setStates((prev) => ({ ...prev, [lessonId]: next }));
  };

  const generate = async (job: StudentNoteJob) => {
    active.current.get(job.lessonId)?.abort();
    const controller = new AbortController();
    active.current.set(job.lessonId, controller);
    setStates((prev) => ({
      ...prev,
      [job.lessonId]: { status: "generating", note: prev[job.lessonId]?.note ?? null, message: null },
    }));
    try {
      const note = await generator.writeNote(job, controller.signal);
      update(job.lessonId, { status: "idle", note, message: null });
      try {
        await gateway.saveStudentNote({
          context: { academicSessionId, academicPeriodId, teachingAssignmentId },
          lessonId: job.lessonId,
          note,
        });
      } catch {
        update(job.lessonId, {
          status: "failed",
          note,
          message: "The note was written but could not be saved. It may be lost when you leave this lesson.",
        });
      }
    } catch (error) {
      if (error instanceof NoteGenerationCancelledError || controller.signal.aborted) {
        setStates((prev) => ({
          ...prev,
          [job.lessonId]: { status: "idle", note: prev[job.lessonId]?.note ?? null, message: null },
        }));
        return;
      }
      setStates((prev) => ({
        ...prev,
        [job.lessonId]: { status: "failed", note: prev[job.lessonId]?.note ?? null, message: describe(error) },
      }));
    } finally {
      if (active.current.get(job.lessonId) === controller) active.current.delete(job.lessonId);
    }
  };

  return { stateFor, generate };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "The student note could not be written. Try again.";
}
