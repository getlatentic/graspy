import { describe, expect, it, vi } from "vitest";

import {
  LessonPreparationCancelledError,
  LessonPreparationValidationError,
  LocalLessonPreparationGenerator,
  type LessonPreparationCompletionGateway,
} from "./LocalLessonPreparationGenerator";

const source = {
  lessonId: "lesson-pasted",
  topic: "Equivalent fractions",
  rawPlan:
    "Teacher demonstrates one half and two quarters.\nLearners compare both models.",
};

describe("LocalLessonPreparationGenerator", () => {
  it("prepares exact pasted text through a strict structured request", async () => {
    const gateway: LessonPreparationCompletionGateway = {
      createCompletion: vi.fn().mockResolvedValue(
        JSON.stringify({
          topic: "Equivalent fractions",
          subtopic: "Visual models",
          learningGoals: ["Compare equivalent fractions using visual models."],
          steps: [
            {
              title: "Compare the models",
              teacherActivity: "Display one half and two quarters.",
              learnerActivity: "Explain why both models show the same amount.",
              durationMinutes: 20,
            },
          ],
          instructionalMaterials: ["Fraction strips"],
          assessment: ["Explain one equivalent pair."],
          references: [],
        }),
      ),
    };
    const generator = new LocalLessonPreparationGenerator(gateway);

    const prepared = await generator.prepare(source, {
      signal: new AbortController().signal,
    });

    expect(prepared.learningGoals).toEqual([
      "Compare equivalent fractions using visual models.",
    ]);
    expect(gateway.createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        signatureId: "lesson-preparation.create",
        input: source,
      }),
      expect.any(AbortSignal),
    );
  });

  it("rejects a completion without an extracted learning goal and step", async () => {
    const generator = new LocalLessonPreparationGenerator({
      createCompletion: vi.fn().mockResolvedValue(
        JSON.stringify({
          topic: "Equivalent fractions",
          subtopic: "",
          learningGoals: [],
          steps: [],
          instructionalMaterials: [],
          assessment: [],
          references: [],
        }),
      ),
    });

    await expect(
      generator.prepare(source, { signal: new AbortController().signal }),
    ).rejects.toBeInstanceOf(LessonPreparationValidationError);
  });

  it("turns an aborted native request into a preparation cancellation", async () => {
    const controller = new AbortController();
    const generator = new LocalLessonPreparationGenerator({
      createCompletion: vi.fn().mockImplementation(async () => {
        controller.abort();
        throw new DOMException("stopped", "AbortError");
      }),
    });

    await expect(
      generator.prepare(source, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(LessonPreparationCancelledError);
  });
});
