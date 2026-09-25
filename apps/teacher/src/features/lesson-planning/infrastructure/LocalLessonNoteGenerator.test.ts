import { describe, expect, it, vi } from "vitest";

import { NoteGenerationCancelledError, NoteGenerationQualityError, type StudentNoteJob } from "../application/LessonNoteGenerator";
import { LocalLessonNoteGenerator, type LessonNoteCompletionGateway } from "./LocalLessonNoteGenerator";

const job: StudentNoteJob = {
  context: { academicSessionId: "session", academicPeriodId: "period", teachingAssignmentId: "assignment" },
  lessonId: "lesson-1",
  writtenFromVersion: 3,
  topic: "Equivalent fractions",
  subtopic: "Visual models",
  learningGoals: ["Compare equivalent fractions using visual models."],
  steps: [
    {
      title: "Recall equal parts",
      summary: "Show a whole in equal parts and name them.",
      taught: ["A fraction names equal parts of one whole."],
      workedExamples: [],
      practice: [],
    },
    {
      title: "Compare models",
      summary: "Align fraction strips and compare their lengths.",
      taught: ["When two fractions cover the same amount they are equivalent."],
      workedExamples: ["Compare 1/2 and 2/4 with strips.\nAnswer: They cover the same length."],
      practice: [],
    },
  ],
};

const validNote = JSON.stringify({
  paragraphs: [
    "A fraction names equal parts of one whole.",
    "When two fractions cover the same amount, we call them equivalent.",
    "One half and two quarters cover the same length, so 1/2 and 2/4 are equivalent.",
  ],
});

describe("LocalLessonNoteGenerator", () => {
  it("asks for the note under the lesson-note signature and shows the model only the plan", async () => {
    const gateway = { createCompletion: vi.fn().mockResolvedValue(validNote) } satisfies LessonNoteCompletionGateway;
    const note = await new LocalLessonNoteGenerator(gateway).writeNote(job, new AbortController().signal);

    expect(note.paragraphs).toHaveLength(3);
    expect(note.writtenFromVersion).toBe(3);
    const request = gateway.createCompletion.mock.calls[0][0];
    expect(request.signatureId).toBe("lesson-note.create");
    expect(request.input).toEqual({
      topic: "Equivalent fractions",
      subtopic: "Visual models",
      learningGoals: job.learningGoals,
      steps: job.steps,
    });
  });

  it("keeps the note to the version it was written from", async () => {
    const gateway = { createCompletion: vi.fn().mockResolvedValue(validNote) } satisfies LessonNoteCompletionGateway;
    const note = await new LocalLessonNoteGenerator(gateway).writeNote({ ...job, writtenFromVersion: 9 }, new AbortController().signal);
    expect(note.writtenFromVersion).toBe(9);
  });

  it("rejects a note that came back too thin to read", async () => {
    const gateway = { createCompletion: vi.fn().mockResolvedValue(JSON.stringify({ paragraphs: ["Only one line."] })) } satisfies LessonNoteCompletionGateway;
    await expect(new LocalLessonNoteGenerator(gateway).writeNote(job, new AbortController().signal)).rejects.toBeInstanceOf(NoteGenerationQualityError);
  });

  it("rejects a completion that is not the note we asked for", async () => {
    const gateway = { createCompletion: vi.fn().mockResolvedValue("not json") } satisfies LessonNoteCompletionGateway;
    await expect(new LocalLessonNoteGenerator(gateway).writeNote(job, new AbortController().signal)).rejects.toBeInstanceOf(NoteGenerationQualityError);
  });

  it("does not call the engine once the teacher has stopped", async () => {
    const gateway = { createCompletion: vi.fn().mockResolvedValue(validNote) } satisfies LessonNoteCompletionGateway;
    const controller = new AbortController();
    controller.abort();
    await expect(new LocalLessonNoteGenerator(gateway).writeNote(job, controller.signal)).rejects.toBeInstanceOf(NoteGenerationCancelledError);
    expect(gateway.createCompletion).not.toHaveBeenCalled();
  });
});
