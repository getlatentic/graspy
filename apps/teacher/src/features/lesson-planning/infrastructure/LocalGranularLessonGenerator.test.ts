import { describe, expect, it, vi } from "vitest";

import {
  GranularLessonCancelledError,
  GranularLessonValidationError,
  LocalGranularLessonGenerator,
  type GranularLessonPreparationRequest,
} from "./LocalGranularLessonGenerator";

const request = {
  context: {
    academicSessionId: "session-1",
    academicPeriodId: "period-1",
    teachingAssignmentId: "assignment-1",
  },
  lessonId: "lesson-1",
  input: {},
} as unknown as GranularLessonPreparationRequest;

describe("preparing a lesson through the local engine", () => {
  /**
   * Seen in the running app: stopping from the task bar showed a red "Lesson
   * not prepared" panel. The bar cancels the task in the backend and never
   * touches this request's signal, so the refusal reached the screen looking
   * like a failure of the teacher's lesson.
   */
  it("reads a stop from the task bar as a stop rather than a failure", async () => {
    const generator = new LocalGranularLessonGenerator({
      createCompletion: vi
        .fn()
        .mockRejectedValue(new Error("This work was stopped before it started.")),
    });

    await expect(
      generator.prepare(request, new AbortController().signal),
    ).rejects.toBeInstanceOf(GranularLessonCancelledError);
  });

  it("reads a stop from this screen as a stop", async () => {
    const controller = new AbortController();
    const generator = new LocalGranularLessonGenerator({
      createCompletion: vi.fn().mockImplementation(async () => {
        controller.abort();
        throw new DOMException("stopped", "AbortError");
      }),
    });

    await expect(
      generator.prepare(request, controller.signal),
    ).rejects.toBeInstanceOf(GranularLessonCancelledError);
  });

  /// A real failure must still read as one, or the fix would hide the errors a
  /// teacher has to act on.
  it("leaves a genuine failure as a failure", async () => {
    const generator = new LocalGranularLessonGenerator({
      createCompletion: vi
        .fn()
        .mockRejectedValue(new Error("The lesson engine is unavailable.")),
    });

    await expect(
      generator.prepare(request, new AbortController().signal),
    ).rejects.toThrow("The lesson engine is unavailable.");
  });

  it("refuses a prepared lesson that does not match its contract", async () => {
    const generator = new LocalGranularLessonGenerator({
      createCompletion: vi.fn().mockResolvedValue({ nothing: "useful" }),
    });

    await expect(
      generator.prepare(request, new AbortController().signal),
    ).rejects.toBeInstanceOf(GranularLessonValidationError);
  });
});
