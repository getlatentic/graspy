import { describe, expect, it, vi } from "vitest";

import type { LessonPreparationCompletionRequest } from "./LocalLessonPreparationGenerator";
import { TauriLessonPreparationCompletionGateway } from "./TauriLessonPreparationCompletionGateway";

const request = {
  signatureId: "lesson-preparation.create",
  input: { lessonId: "lesson", topic: "Fractions", rawPlan: "Teach fractions." },
} satisfies LessonPreparationCompletionRequest;

describe("TauriLessonPreparationCompletionGateway", () => {
  it("maps preparation to its dedicated native command", async () => {
    const nativeClient = {
      invoke: vi.fn().mockResolvedValue("prepared"),
    };
    const gateway = new TauriLessonPreparationCompletionGateway(
      nativeClient,
      () => "preparation-request-1",
    );

    await expect(
      gateway.createCompletion(request, new AbortController().signal),
    ).resolves.toBe("prepared");
    expect(nativeClient.invoke).toHaveBeenCalledWith(
      "create_lesson_preparation_completion",
      { requestId: "preparation-request-1", request },
    );
  });

  it("cancels only the active preparation request", async () => {
    let rejectNative: (reason: unknown) => void = () => undefined;
    const nativeClient = {
      invoke: vi.fn().mockImplementation((command: string) => {
        if (command === "cancel_lesson_preparation_completion") {
          return Promise.resolve(undefined);
        }
        return new Promise<unknown>((_, reject) => {
          rejectNative = reject;
        });
      }),
    };
    const gateway = new TauriLessonPreparationCompletionGateway(
      nativeClient,
      () => "preparation-request-2",
    );
    const controller = new AbortController();
    const completion = gateway.createCompletion(request, controller.signal);

    controller.abort();
    rejectNative(new Error("native request stopped"));

    await expect(completion).rejects.toMatchObject({ name: "AbortError" });
    expect(nativeClient.invoke).toHaveBeenCalledWith(
      "cancel_lesson_preparation_completion",
      { requestId: "preparation-request-2" },
    );
  });
});
