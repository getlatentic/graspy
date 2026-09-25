import { beforeEach, describe, expect, it, vi } from "vitest";
import contract from "@/lib/a2a/reply-contract.json";
import type { CurriculumData } from "@/lib/curriculum-record";

const callAppTool = vi.fn();
const openToolView = vi.fn();
vi.mock("@/lib/mcp/server", () => ({ callAppTool, openToolView }));

const { lessonMade, lessonTarget, nextLesson, objectivesOf } =
  await import("./lesson-app");

const PLAN: CurriculumData = {
  id: "c1",
  planId: "plan-1",
  country: "Nigeria",
  language: "English",
  gradeLevel: "JSS 1",
  subjects: [{ name: "Mathematics", slug: "mathematics" }],
  topics: { mathematics: ["Number Systems", "Place Value", "Fractions"] },
  createdAt: 0,
  updatedAt: 0,
};
const MATHS = PLAN.subjects[0];
const state = (status: string, lesson: object | null = null) => ({
  structuredContent: { status, whole: status === "ready", lesson },
});

beforeEach(() => {
  vi.useRealTimers();
  callAppTool.mockReset();
  openToolView.mockReset();
});

describe("a topic's lesson", () => {
  it("is asked for as the server reads the target", () => {
    const target = lessonTarget(PLAN, MATHS, 2)!;
    const expected = contract.lesson.arguments.target;

    // buildsOn goes only with a path's goal.
    const { buildsOn: _optional, ...fields } = expected;
    expect(Object.keys(target).sort()).toEqual(Object.keys(fields).sort());
    expect(target).toMatchObject({
      topic: "Fractions",
      topicIndex: 2,
      totalTopics: 3,
      gradeLevel: "JSS 1",
    });
    expect(lessonTarget(PLAN, MATHS, 3)).toBeNull();
  });

  it("says, for a path's goal, which steps to it were skipped", () => {
    const path: CurriculumData = {
      ...PLAN,
      subjects: [{ name: "Real analysis", slug: "real-analysis" }],
      topics: { "real-analysis": ["Sequences", "Limits", "Continuity"] },
      goals: { "real-analysis": "Continuity" },
    };
    const subject = path.subjects[0];

    expect(
      lessonTarget(path, subject, 2, (index) => index === 0),
    ).toMatchObject({ topic: "Continuity", buildsOn: ["Limits"] });
    expect(lessonTarget(path, subject, 1)).not.toHaveProperty("buildsOn");
  });

  it("is waited for until the server has made it", async () => {
    vi.useFakeTimers();
    const target = lessonTarget(PLAN, MATHS, 0)!;
    openToolView.mockResolvedValue({ toolResult: state("making") });
    callAppTool
      .mockResolvedValueOnce(state("making"))
      .mockResolvedValueOnce(state("ready", { keyPoints: ["k"] }));

    const made = lessonMade(target);
    await vi.runAllTimersAsync();

    await expect(made).resolves.toMatchObject({ status: "ready" });
    expect(callAppTool).toHaveBeenCalledWith("lesson_progress", { target });
  });

  it("fails the wait when the server could not make it", async () => {
    openToolView.mockResolvedValue({ toolResult: state("failed") });

    await expect(lessonMade(lessonTarget(PLAN, MATHS, 0)!)).rejects.toThrow();
  });
});

describe("the next lesson", () => {
  it("is the first topic after this one not yet learnt", () => {
    const next = nextLesson(PLAN, MATHS, 0, (index) => index === 1);
    expect(next).toMatchObject({
      index: 2,
      topic: "Fractions",
      target: { topicIndex: 2, topic: "Fractions" },
    });
  });

  it("goes back to one skipped once the last is finished", () => {
    expect(nextLesson(PLAN, MATHS, 2, (index) => index === 0)?.index).toBe(1);
  });

  it("is none once every other topic is learnt", () => {
    expect(nextLesson(PLAN, MATHS, 0, () => true)).toBeNull();
  });
});

describe("a lesson's objectives", () => {
  it("are read from the lesson as the server has it, text only", () => {
    const result = {
      content: [],
      ...state("making", { objectives: ["Name the parts of a fraction", 7] }),
    };

    expect(objectivesOf(result)).toEqual(["Name the parts of a fraction"]);
  });

  it("are none before the lesson is planned or for another result", () => {
    expect(objectivesOf({ content: [], ...state("making") })).toEqual([]);
    expect(
      objectivesOf({ content: [], structuredContent: { answer: 1 } }),
    ).toEqual([]);
    expect(objectivesOf(undefined)).toEqual([]);
  });
});
