// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumData } from "@/lib/curriculum-record";

const learnerRecord = vi.fn();
vi.mock("@/lib/learner-record", () => ({
  keptRecord: () => null,
  learnerRecord,
  planMarks: () => ({ learnt: [], ready: [], review: [] }),
  rememberMark: vi.fn(),
}));
const keptRoute = vi.fn();
vi.mock("@/lib/learner-route", () => ({ keptRoute }));
vi.mock("@/lib/account/use-account", () => ({ useAccount: () => null }));
vi.mock("@/lib/user-storage", () => ({
  getUserProfile: () => ({ system: "NG", level: "nursery-1" }),
}));
vi.mock("../lib/lesson-offline", () => ({
  copyReadyLessons: vi.fn(async () => undefined),
}));

const { useTopicProgress } = await import("./use-topic-progress");

const plan = {
  planId: "plan-1",
  updatedAt: 1,
  subjects: [],
} as unknown as CurriculumData;

describe("useTopicProgress", () => {
  beforeEach(() => {
    learnerRecord.mockReset().mockResolvedValue({ topics: [], answers: [] });
    keptRoute.mockReset();
  });

  it("reads the learner's record for a class that has slides", async () => {
    keptRoute.mockReturnValue(false);
    renderHook(() => useTopicProgress(plan, true));
    await waitFor(() => expect(learnerRecord).toHaveBeenCalledWith("plan-1"));
  });

  it("reads it while the class's route is not yet known", async () => {
    keptRoute.mockReturnValue(null);
    renderHook(() => useTopicProgress(plan, true));
    await waitFor(() => expect(learnerRecord).toHaveBeenCalledTimes(1));
  });

  it("does not read it for a class that learns by voice alone", async () => {
    keptRoute.mockReturnValue(true);
    renderHook(() => useTopicProgress(plan, true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(learnerRecord).not.toHaveBeenCalled();
  });
});
