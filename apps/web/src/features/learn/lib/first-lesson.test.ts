import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumData } from "@/lib/curriculum-record";

const lessonMade = vi.fn();
vi.mock("./lesson-app", async (actual) => ({
  ...(await actual<typeof import("./lesson-app")>()),
  lessonMade,
}));

const { FIRST_LESSON_LIMIT_MS, prepareFirstLesson } =
  await import("./first-lesson");

const PLAN: CurriculumData = {
  id: "current",
  planId: "plan-1",
  country: "NG",
  language: "en",
  gradeLevel: "JSS 1",
  subjects: [{ name: "Mathematics", slug: "mathematics" }],
  topics: { mathematics: ["Fractions"] },
  createdAt: 0,
  updatedAt: 0,
};

beforeEach(() => {
  lessonMade.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("the first lesson made ahead", () => {
  it("is waited for with a time limit, for the first topic", async () => {
    lessonMade.mockResolvedValue({ status: "ready" });

    await expect(prepareFirstLesson(PLAN, PLAN.subjects[0])).resolves.toBe(
      true,
    );
    expect(lessonMade).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "Fractions", topicIndex: 0 }),
      { limitMs: FIRST_LESSON_LIMIT_MS, signal: undefined },
    );
  });

  it("is a failure to say, not to throw: the plan does not depend on it", async () => {
    lessonMade.mockRejectedValue(new Error("The lesson could not be made"));

    await expect(prepareFirstLesson(PLAN, PLAN.subjects[0])).resolves.toBe(
      false,
    );
    expect(console.warn).toHaveBeenCalled();
  });

  it("is stopped without a warning when the learner has moved on", async () => {
    const stop = new AbortController();
    lessonMade.mockImplementation(async () => {
      stop.abort();
      throw new Error("stopped");
    });

    await expect(
      prepareFirstLesson(PLAN, PLAN.subjects[0], stop.signal),
    ).resolves.toBe(false);
    expect(lessonMade).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ signal: stop.signal }),
    );
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("never rejects, whatever is wrong with the plan it is given", async () => {
    await expect(
      prepareFirstLesson(undefined as never, PLAN.subjects[0]),
    ).resolves.toBe(false);
  });

  it("is nothing to make for a subject with no topics", async () => {
    await expect(
      prepareFirstLesson({ ...PLAN, topics: {} }, PLAN.subjects[0]),
    ).resolves.toBe(false);
    expect(lessonMade).not.toHaveBeenCalled();
  });
});
