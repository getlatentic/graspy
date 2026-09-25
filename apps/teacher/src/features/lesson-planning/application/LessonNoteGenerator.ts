import type { StudentNote } from "../domain/studentNote";
import type { LessonTaughtStep } from "../domain/lessonTaught";
import type { LessonContextRequest } from "../domain/lessonPlanning";

/**
 * The lesson content a student note is written from — the plan's own taught
 * words, so everything the note states is something the plan states.
 */
export interface StudentNoteJob {
  readonly context: LessonContextRequest;
  readonly lessonId: string;
  readonly writtenFromVersion: number;
  readonly topic: string;
  readonly subtopic: string | null;
  readonly learningGoals: readonly string[];
  readonly steps: readonly LessonTaughtStep[];
}

export interface LessonNoteGenerator {
  writeNote(job: StudentNoteJob, signal: AbortSignal): Promise<StudentNote>;
}

export class NoteGenerationCancelledError extends Error {
  constructor() {
    super("Writing the student note was stopped.");
    this.name = "NoteGenerationCancelledError";
  }
}

export class NoteGenerationQualityError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "NoteGenerationQualityError";
  }
}
