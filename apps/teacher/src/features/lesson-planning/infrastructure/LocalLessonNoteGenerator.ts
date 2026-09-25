import { z } from "zod";

import {
  NoteGenerationCancelledError,
  NoteGenerationQualityError,
  type LessonNoteGenerator,
  type StudentNoteJob,
} from "../application/LessonNoteGenerator";
import type { StudentNote } from "../domain/studentNote";

export interface LessonNoteCompletionRequest {
  readonly task: {
    readonly context: import("../domain/lessonPlanning").LessonContextRequest;
    readonly lessonId: string;
    readonly label: string;
  };
  readonly signatureId: "lesson-note.create";
  readonly input: Record<string, unknown>;
}

export interface LessonNoteCompletionGateway {
  createCompletion(request: LessonNoteCompletionRequest, signal: AbortSignal): Promise<string>;
}

const completionSchema = z.object({
  paragraphs: z.array(z.string().trim().min(1)).min(3).max(10),
});

/** The lesson content the model is shown to write the note. */
function buildRequest(job: StudentNoteJob): LessonNoteCompletionRequest {
  return {
    signatureId: "lesson-note.create",
    task: {
      context: job.context,
      lessonId: job.lessonId,
      label: `Writing the student note — ${job.subtopic ?? job.topic}`,
    },
    input: {
      topic: job.topic,
      subtopic: job.subtopic ?? "",
      learningGoals: job.learningGoals,
      steps: job.steps.map((step) => ({
        title: step.title,
        summary: step.summary,
        taught: step.taught,
        workedExamples: step.workedExamples,
        practice: step.practice,
      })),
    },
  };
}

/**
 * Writes a student note by asking the local model for the paragraphs a class
 * reads, then holding the result to the note's shape before it is trusted.
 *
 * The model is shown the plan and nothing else, so the note stays a plain-prose
 * account of the same lesson rather than a second, drifting one.
 */
export class LocalLessonNoteGenerator implements LessonNoteGenerator {
  constructor(private readonly gateway: LessonNoteCompletionGateway) {}

  async writeNote(job: StudentNoteJob, signal: AbortSignal): Promise<StudentNote> {
    if (signal.aborted) throw new NoteGenerationCancelledError();
    const completion = await this.gateway.createCompletion(buildRequest(job), signal);
    if (signal.aborted) throw new NoteGenerationCancelledError();

    let parsed: unknown;
    try {
      parsed = JSON.parse(completion);
    } catch {
      throw new NoteGenerationQualityError("The note came back in a form we could not read. Try again.");
    }
    const result = completionSchema.safeParse(parsed);
    if (!result.success) {
      throw new NoteGenerationQualityError("The note came back incomplete. Try again.");
    }
    return {
      paragraphs: result.data.paragraphs.map((paragraph) => paragraph.trim()),
      writtenFromVersion: job.writtenFromVersion,
    };
  }
}
