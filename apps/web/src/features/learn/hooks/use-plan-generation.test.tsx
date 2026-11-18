// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { CurriculumStreamEvent } from "@/lib/curriculum-api";
import type {
  CurriculumData,
  CurriculumSubject,
} from "@/lib/curriculum-record";
import type { Translate } from "@/lib/i18n-context";

const mocks = vi.hoisted(() => ({
  streamCurriculum: vi.fn(),
  saveCurriculum: vi.fn(),
  prepareFirstLesson: vi.fn(),
  getUserProfile: vi.fn(),
}));
vi.mock("@/lib/curriculum-api", () => ({
  streamCurriculum: mocks.streamCurriculum,
}));
vi.mock("@/lib/curriculum-db", () => ({
  saveCurriculum: mocks.saveCurriculum,
}));
vi.mock("../lib/first-lesson", () => ({
  prepareFirstLesson: mocks.prepareFirstLesson,
}));
vi.mock("@/lib/user-storage", () => ({ getUserProfile: mocks.getUserProfile }));

import { usePlanGeneration } from "./use-plan-generation";

const t = ((key: string) => key) as Translate;
const REQUEST = { country: "NG", language: "en", subjects: ["Mathematics"] };
const RESULT: CurriculumStreamEvent = {
  type: "result",
  subjects: [{ name: "Mathematics", slug: "mathematics" }],
  topics: { mathematics: ["Fractions"] },
};

async function* events(...list: CurriculumStreamEvent[]) {
  yield* list;
}

function failingStream(error: Error): AsyncGenerator<CurriculumStreamEvent> {
  return {
    next: () => Promise.reject(error),
    return: () => Promise.resolve({ done: true, value: undefined }),
    throw: (e: unknown) => Promise.reject(e),
    [Symbol.asyncIterator]() {
      return this;
    },
  } as AsyncGenerator<CurriculumStreamEvent>;
}

function setup() {
  let next: CurriculumSubject | null = null;
  const shown: CurriculumData[] = [];
  const view = renderHook(() =>
    usePlanGeneration({
      show: (plan) => shown.push(plan),
      next: () => next,
      chooseNext: (subject) => (next = subject),
      gradeLevel: "JSS 1",
    }),
  );
  return { ...view, shown };
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.getUserProfile.mockReturnValue({
    country: "NG",
    language: "en",
    gradeLevel: "JSS 1",
    preferredSubjects: ["Mathematics"],
  });
  mocks.saveCurriculum.mockResolvedValue(undefined);
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("making a plan", () => {
  it("is kept and done as soon as its topics are in, while the first lesson is still being made", async () => {
    mocks.streamCurriculum.mockReturnValue(events(RESULT));
    mocks.prepareFirstLesson.mockReturnValue(new Promise(() => {}));
    const { result } = setup();

    await act(() => result.current.generate(REQUEST, t));

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mocks.saveCurriculum).toHaveBeenCalledTimes(1);
    expect(mocks.saveCurriculum.mock.calls[0][0]).toMatchObject({
      topics: { mathematics: ["Fractions"] },
    });
    // The lesson is asked for only after the plan is kept.
    expect(mocks.saveCurriculum.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prepareFirstLesson.mock.invocationCallOrder[0],
    );
    expect(mocks.prepareFirstLesson.mock.calls[0][0].planId).toBe(
      mocks.saveCurriculum.mock.calls[0][0].planId,
    );
  });

  it("stands when the first lesson fails: the plan is kept and there is no error", async () => {
    mocks.streamCurriculum.mockReturnValue(events(RESULT));
    mocks.prepareFirstLesson.mockResolvedValue(false);
    const { result } = setup();

    await act(() => result.current.generate(REQUEST, t));
    await act(async () => {});

    expect(result.current.error).toBeNull();
    expect(mocks.saveCurriculum).toHaveBeenCalledTimes(1);
  });

  it("reports the timings when the first lesson is done, as numbers only", async () => {
    mocks.streamCurriculum.mockReturnValue(events(RESULT));
    mocks.prepareFirstLesson.mockResolvedValue(true);
    const { result } = setup();

    await act(() => result.current.generate(REQUEST, t));
    await act(async () => {});

    const info = vi
      .mocked(console.info)
      .mock.calls.find(([tag]) => tag === "[plan-timing]");
    const timings = JSON.parse(String(info?.[1]));
    expect(Object.keys(timings).sort()).toEqual([
      "firstLessonMs",
      "firstSubjectMs",
      "streamMs",
      "subjects",
    ]);
    expect(timings.firstLessonMs).not.toBeNull();
  });

  it("reaches the error with its retry when the stream goes quiet, and keeps nothing", async () => {
    mocks.streamCurriculum.mockReturnValue(
      failingStream(new ApiError("Nothing arrived for 60 seconds", 504)),
    );
    const { result } = setup();

    await act(() => result.current.generate(REQUEST, t));

    expect(result.current.error).toBe("chat.temporaryProblem");
    expect(result.current.isGenerating).toBe(false);
    expect(mocks.saveCurriculum).not.toHaveBeenCalled();
    expect(mocks.prepareFirstLesson).not.toHaveBeenCalled();
  });

  it("can be tried again after it failed", async () => {
    mocks.streamCurriculum.mockReturnValueOnce(
      failingStream(new ApiError("quiet", 504)),
    );
    mocks.streamCurriculum.mockReturnValueOnce(events(RESULT));
    mocks.prepareFirstLesson.mockResolvedValue(true);
    const { result } = setup();

    await act(() => result.current.generate(REQUEST, t));
    await act(() => result.current.generate(REQUEST, t));

    expect(result.current.error).toBeNull();
    expect(mocks.saveCurriculum).toHaveBeenCalledTimes(1);
  });
});
