import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumData } from "@/lib/curriculum-record";

const callAppTool = vi.fn();
const openToolView = vi.fn();
vi.mock("@/lib/mcp/server", () => ({ callAppTool, openToolView }));

const PLAN: CurriculumData = {
  id: "c1",
  planId: "plan-1",
  country: "Nigeria",
  language: "English",
  gradeLevel: "JSS 1",
  subjects: [{ name: "Mathematics", slug: "mathematics" }],
  topics: { mathematics: ["Number Systems", "Fractions"] },
  createdAt: 0,
  updatedAt: 0,
};
const MATHS = PLAN.subjects[0];
const result = (status: string, whole = status === "ready") => ({
  content: [],
  structuredContent: { status, whole, lesson: { title: "t", slides: [] } },
});
const card = (status: string, whole?: boolean) => ({
  resourceUri: "ui://graspy/lesson",
  toolName: "give_lesson",
  toolInput: {},
  toolResult: result(status, whole),
});

let online = true;

async function fresh() {
  vi.resetModules();
  return {
    ...(await import("./lesson-offline")),
    ...(await import("./lesson-app")),
    ...(await import("@/lib/lesson-copies")),
  };
}

beforeEach(() => {
  online = true;
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  vi.stubGlobal("navigator", {
    get onLine() {
      return online;
    },
  });
  callAppTool.mockReset();
  openToolView.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe("a lesson without a connection", () => {
  it("opens from the copy kept when it last opened whole", async () => {
    const { lessonTarget, openLessonOrCopy } = await fresh();
    const target = lessonTarget(PLAN, MATHS, 1)!;
    const whole = card("ready");
    openToolView.mockResolvedValueOnce(whole);
    await openLessonOrCopy(target);

    online = false;
    openToolView.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(openLessonOrCopy(target)).resolves.toEqual(whole);
  });

  it("has no copy of a lesson that never arrived whole", async () => {
    const { lessonTarget, openLessonOrCopy } = await fresh();
    const target = lessonTarget(PLAN, MATHS, 1)!;
    openToolView.mockResolvedValueOnce(card("ready", false));
    await openLessonOrCopy(target);

    online = false;
    openToolView.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(openLessonOrCopy(target)).rejects.toThrow();
  });

  it("answers the view watching it from the copy", async () => {
    const { keepIfWhole, lessonTarget, lessonToolOrCopy } = await fresh();
    const target = lessonTarget(PLAN, MATHS, 1)!;
    await keepIfWhole(target, card("ready"));
    online = false;
    callAppTool.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      lessonToolOrCopy(target, "lesson_progress", { target }),
    ).resolves.toEqual(result("ready"));
  });
});

describe("the copies", () => {
  it("follow the record: every lesson it has in the plan, and no other", async () => {
    const { copiedTopics, copyReadyLessons, keepIfWhole, lessonTarget } =
      await fresh();
    const gone = { ...lessonTarget(PLAN, MATHS, 0)!, planId: "plan-0" };
    await keepIfWhole(gone, card("ready"));
    openToolView.mockResolvedValue(card("ready"));
    const fractions = {
      planId: "plan-1",
      subjectSlug: "mathematics",
      topicIndex: 1,
      topic: "Fractions",
    };

    await copyReadyLessons(PLAN, [fractions]);
    await copyReadyLessons(PLAN, [fractions]);

    expect(await copiedTopics()).toEqual([fractions]);
    expect(openToolView).toHaveBeenCalledTimes(1);
  });
});
