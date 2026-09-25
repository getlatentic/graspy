import { describe, expect, it, vi } from "vitest";

import type { GranularLessonProgramInput } from "../domain/granularLesson";
import type { GranularLessonPreparationRequest } from "./LocalGranularLessonGenerator";
import { TauriGranularLessonCompletionGateway } from "./TauriGranularLessonCompletionGateway";

const request: GranularLessonPreparationRequest = {
  context: {
    academicSessionId: "session-1",
    academicPeriodId: "period-1",
    teachingAssignmentId: "assignment-1",
  },
  lessonId: "lesson-1",
  input: { topic: "Equivalent fractions" } as GranularLessonProgramInput,
};

describe("TauriGranularLessonCompletionGateway", () => {
  it("names the lesson it is preparing alongside its program input", async () => {
    const record = { plan: { topic: "Fractions" } };
    const nativeClient = {
      invoke: vi.fn().mockResolvedValue(record),
    };
    const gateway = new TauriGranularLessonCompletionGateway(
      nativeClient,
      () => "request-1",
    );

    await expect(
      gateway.createCompletion(request, new AbortController().signal),
    ).resolves.toBe(record);
    expect(nativeClient.invoke).toHaveBeenCalledWith(
      "create_granular_lesson_completion",
      {
        requestId: "request-1",
        request,
      },
    );
  });

  it("cancels the same native request when the teacher stops preparation", async () => {
    let resolveCompletion: ((value: unknown) => void) | undefined;
    const nativeClient = {
      invoke: vi.fn((command: string) => {
        if (command === "cancel_lesson_preparation_completion") {
          return Promise.resolve(undefined);
        }
        return new Promise((resolve) => {
          resolveCompletion = resolve;
        });
      }),
    };
    const gateway = new TauriGranularLessonCompletionGateway(
      nativeClient,
      () => "request-2",
    );
    const controller = new AbortController();
    const completion = gateway.createCompletion(request, controller.signal);

    controller.abort();

    await expect(completion).rejects.toMatchObject({ name: "AbortError" });
    expect(nativeClient.invoke).toHaveBeenCalledWith(
      "cancel_lesson_preparation_completion",
      { requestId: "request-2" },
    );
    resolveCompletion?.({ plan: { topic: "Fractions" } });
  });
});
