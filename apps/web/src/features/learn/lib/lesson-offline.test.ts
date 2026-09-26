import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumData } from "@/lib/curriculum-record";

// graspy's server as the MCP client reaches it, so the cards are the ones the app's own
// server.ts builds.
const VIEW = "ui://graspy/lesson";
const graspy = {
  reachable: true,
  answers: {} as Record<string, unknown>,
  called: [] as string[],
  /** Topics whose lesson the server fails to give. */
  failing: new Set<string>(),
};
function reach() {
  if (!graspy.reachable) throw new TypeError("Failed to fetch");
}
vi.mock("@modelcontextprotocol/client", () => ({
  Client: class {
    connect = async () => reach();
    listTools = async () => ({
      tools: [
        { name: "give_lesson", _meta: { ui: { resourceUri: VIEW } } },
        { name: "lesson_progress" },
      ],
    });
    listResources = async () => ({ resources: [] });
    callTool = async ({
      name,
      arguments: args,
    }: {
      name: string;
      arguments: { target: { topic: string } };
    }) => {
      reach();
      graspy.called.push(name);
      if (graspy.failing.has(args.target.topic)) throw new Error("502");
      return graspy.answers[name];
    };
  },
  StreamableHTTPClientTransport: class {},
}));
vi.mock("@/lib/api/session", () => ({ fetchWithSession: vi.fn() }));

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
const NUMBER_SYSTEMS = {
  planId: "plan-1",
  subjectSlug: "mathematics",
  topicIndex: 0,
  topic: "Number Systems",
};
const FRACTIONS = {
  planId: "plan-1",
  subjectSlug: "mathematics",
  topicIndex: 1,
  topic: "Fractions",
};
const result = (status: string, whole = status === "ready") => ({
  content: [],
  structuredContent: { status, whole, lesson: { title: "t", slides: [] } },
});
const card = (status: string, whole?: boolean) => ({
  resourceUri: VIEW,
  toolName: "give_lesson",
  toolInput: {},
  toolResult: result(status, whole),
});

let online = true;

function goOffline() {
  online = false;
  graspy.reachable = false;
}

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
  graspy.reachable = true;
  graspy.called = [];
  graspy.failing = new Set();
  graspy.answers = {
    give_lesson: result("ready"),
    lesson_progress: result("ready"),
  };
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  vi.stubGlobal("navigator", {
    get onLine() {
      return online;
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("a lesson without a connection", () => {
  it("opens from the copy kept when it last opened whole", async () => {
    const { lessonTarget, openLessonOrCopy } = await fresh();
    const target = lessonTarget(PLAN, MATHS, 1)!;
    const whole = await openLessonOrCopy(target);

    goOffline();

    await expect(openLessonOrCopy(target)).resolves.toEqual(whole);
  });

  it("has no copy of a lesson that never arrived whole", async () => {
    const { lessonTarget, openLessonOrCopy } = await fresh();
    const target = lessonTarget(PLAN, MATHS, 1)!;
    graspy.answers.give_lesson = result("ready", false);
    await openLessonOrCopy(target);

    goOffline();

    await expect(openLessonOrCopy(target)).rejects.toThrow();
  });

  it("answers the view watching it from the copy", async () => {
    const { keepIfWhole, lessonTarget, lessonToolOrCopy } = await fresh();
    const target = lessonTarget(PLAN, MATHS, 1)!;
    await keepIfWhole(target, card("ready"));
    goOffline();

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

    await copyReadyLessons(PLAN, [FRACTIONS]);
    await copyReadyLessons(PLAN, [FRACTIONS]);

    expect(await copiedTopics()).toEqual([FRACTIONS]);
    expect(graspy.called).toHaveLength(1);
  });

  it("never ask the server to make a lesson", async () => {
    const { copyReadyLessons } = await fresh();

    await copyReadyLessons(PLAN, [FRACTIONS]);

    expect(graspy.called).toEqual(["lesson_progress"]);
  });

  it("open offline as the lesson opens online", async () => {
    const { copyReadyLessons, lessonTarget, openLesson, openLessonOrCopy } =
      await fresh();
    const target = lessonTarget(PLAN, MATHS, 1)!;
    const opened = await openLesson(target);
    await copyReadyLessons(PLAN, [FRACTIONS]);

    goOffline();

    await expect(openLessonOrCopy(target)).resolves.toEqual(opened);
  });

  it("go on past a lesson the server fails to give", async () => {
    const { copiedTopics, copyReadyLessons } = await fresh();
    graspy.failing.add("Number Systems");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await copyReadyLessons(PLAN, [NUMBER_SYSTEMS, FRACTIONS]);

    expect(await copiedTopics()).toEqual([FRACTIONS]);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("keep only a lesson the server has whole", async () => {
    const { copiedTopics, copyReadyLessons } = await fresh();
    graspy.answers.lesson_progress = result("ready", false);

    await copyReadyLessons(PLAN, [FRACTIONS]);

    expect(await copiedTopics()).toEqual([]);
  });
});
