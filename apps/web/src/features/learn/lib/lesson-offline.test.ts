import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumData } from "@/lib/curriculum-record";

// graspy's server as the MCP client reaches it, so the cards are the ones the app's own
// server.ts builds. The client connects through the app's own session.ts.
const VIEW = "ui://graspy/lesson";
type SessionExchange =
  "issued" | "unreachable" | "unchecked" | "unavailable" | "refused" | "empty";
const graspy = {
  reachable: true,
  session: "issued" as SessionExchange,
  answers: {} as Record<string, unknown>,
  called: [] as string[],
  /** Topics whose lesson the server fails to give. */
  failing: new Set<string>(),
  /** Topics whose lesson the server answers with a refusal. */
  refusing: new Set<string>(),
  connects: 0,
};
function reach() {
  if (!graspy.reachable) throw new TypeError("Failed to fetch");
}
interface Transport {
  url: URL;
  fetch: (url: URL) => Promise<Response>;
}
vi.mock("@modelcontextprotocol/client", async (actual) => ({
  ...(await actual<typeof import("@modelcontextprotocol/client")>()),
  Client: class {
    connect = async (transport: Transport) => {
      graspy.connects += 1;
      reach();
      await transport.fetch(transport.url);
    };
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
      if (graspy.refusing.has(args.target.topic))
        return { isError: true, content: [] };
      return graspy.answers[name];
    };
  },
  StreamableHTTPClientTransport: class implements Transport {
    url: URL;
    fetch: Transport["fetch"];
    constructor(url: URL, opts: { fetch: Transport["fetch"] }) {
      this.url = url;
      this.fetch = opts.fetch;
    }
  },
}));
const { googleIdToken } = vi.hoisted(() => ({
  googleIdToken: vi.fn<(fresh: boolean) => Promise<string | null>>(),
}));
vi.mock("@/lib/account/google-auth", () => ({ googleIdToken }));
vi.mock("@/lib/device-id", async (actual) => ({
  ...(await actual<typeof import("@/lib/device-id")>()),
  fingerprint: async () => null,
}));

async function graspyFetch(input: string | URL): Promise<Response> {
  if (!String(input).endsWith("/session")) return new Response(null);
  if (graspy.session === "unreachable") throw new TypeError("Failed to fetch");
  if (graspy.session === "refused") {
    return Response.json({ error: "refused" }, { status: 403 });
  }
  if (graspy.session === "unchecked") {
    const detail = {
      error: "Sign-in could not be checked. Try again.",
      code: "sign_in_unchecked",
    };
    return Response.json({ detail }, { status: 503 });
  }
  if (graspy.session === "unavailable") {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
  const token = graspy.session === "empty" ? "" : "session-token";
  return Response.json({ token, expiresIn: 3600 });
}

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
const result = (
  status: string,
  whole = status === "ready",
  lessonId: string | null = "lesson-1",
) => ({
  content: [],
  structuredContent: {
    status,
    whole,
    lessonId,
    lesson: { title: lessonId ?? "t", slides: [] },
  },
});
/** The topic as the record marks it once its lesson is kept. */
const ready = (topic: typeof FRACTIONS, lessonId = "lesson-1") => ({
  ...topic,
  lessonId,
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
    ...(await import("@/lib/idb")),
  };
}

beforeEach(() => {
  online = true;
  graspy.reachable = true;
  graspy.session = "issued";
  graspy.called = [];
  graspy.failing = new Set();
  graspy.refusing = new Set();
  graspy.connects = 0;
  graspy.answers = {
    give_lesson: result("ready"),
    lesson_progress: result("ready"),
  };
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  vi.stubGlobal("fetch", graspyFetch);
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

  it("does not answer the view from the copy when the server answered with an error", async () => {
    const { keepIfWhole, lessonTarget, lessonToolOrCopy } = await fresh();
    const target = lessonTarget(PLAN, MATHS, 1)!;
    await keepIfWhole(target, card("ready"));
    graspy.failing.add(target.topic);

    await expect(
      lessonToolOrCopy(target, "lesson_progress", { target }),
    ).rejects.toThrow("502");
  });
});

describe("a lesson whose session must be renewed", () => {
  async function openedWhole() {
    const { lessonTarget, openLessonOrCopy } = await fresh();
    const target = lessonTarget(PLAN, MATHS, 1)!;
    return { target, whole: await openLessonOrCopy(target) };
  }

  it.each([
    ["graspy cannot be reached to renew it", "unreachable"],
    ["graspy cannot reach Google to check the sign-in", "unchecked"],
  ] as const)("opens from the copy kept when %s", async (_, exchange) => {
    const { target, whole } = await openedWhole();

    graspy.session = exchange;
    const { openLessonOrCopy } = await fresh();

    await expect(openLessonOrCopy(target)).resolves.toEqual(whole);
  });

  it.each([
    ["refuses it", "refused", "refused"],
    ["issues it empty", "empty", "The server issued an empty session"],
    ["answers 503 for another reason", "unavailable", "unavailable"],
  ] as const)(
    "is not stood in for when graspy %s",
    async (_, exchange, answer) => {
      const { target } = await openedWhole();

      graspy.session = exchange;
      const { openLessonOrCopy } = await fresh();

      await expect(openLessonOrCopy(target)).rejects.toThrow(answer);
    },
  );
});

describe("a signed-in lesson whose ID token Firebase cannot give", () => {
  const firebaseError = (code: string) =>
    Object.assign(new Error(`Firebase: Error (${code}).`), { code });

  // The account is read from storage as the module loads, so it is set before fresh().
  function signedIn() {
    const account = { uid: "uid1", learner: { id: "l1", name: "Ada" } };
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) =>
          k === "graspy.account" ? JSON.stringify(account) : null,
        setItem: () => {},
        removeItem: () => {},
      },
    });
  }

  async function openedWhole() {
    const { lessonTarget, openLessonOrCopy } = await fresh();
    const target = lessonTarget(PLAN, MATHS, 1)!;
    return { target, whole: await openLessonOrCopy(target) };
  }

  it.each(["auth/too-many-requests", "auth/internal-error"])(
    "opens from the copy kept when Firebase answers %s",
    async (code) => {
      const { target, whole } = await openedWhole();

      signedIn();
      googleIdToken.mockRejectedValue(firebaseError(code));
      const { openLessonOrCopy } = await fresh();

      await expect(openLessonOrCopy(target)).resolves.toEqual(whole);
    },
  );

  it("is not stood in for when Google refuses the sign-in", async () => {
    const { target } = await openedWhole();

    signedIn();
    googleIdToken.mockRejectedValue(firebaseError("auth/user-token-expired"));
    const { openLessonOrCopy } = await fresh();

    await expect(openLessonOrCopy(target)).rejects.toThrow(
      "Google refused the sign-in",
    );
  });
});

describe("the copies", () => {
  it("follow the record: every lesson it has in the plan, and no other", async () => {
    const { copiedLessons, copyReadyLessons, keepIfWhole, lessonTarget } =
      await fresh();
    const gone = { ...lessonTarget(PLAN, MATHS, 0)!, planId: "plan-0" };
    await keepIfWhole(gone, card("ready"));

    await copyReadyLessons(PLAN, [ready(FRACTIONS)]);
    await copyReadyLessons(PLAN, [ready(FRACTIONS)]);

    expect(await copiedLessons()).toEqual([ready(FRACTIONS)]);
    expect(graspy.called).toHaveLength(1);
  });

  it("never ask the server to make a lesson", async () => {
    const { copyReadyLessons } = await fresh();

    await copyReadyLessons(PLAN, [ready(FRACTIONS)]);

    expect(graspy.called).toEqual(["lesson_progress"]);
  });

  it("open offline as the lesson opens online", async () => {
    const { copyReadyLessons, lessonTarget, openLesson, openLessonOrCopy } =
      await fresh();
    const target = lessonTarget(PLAN, MATHS, 1)!;
    const opened = await openLesson(target);
    await copyReadyLessons(PLAN, [ready(FRACTIONS)]);

    goOffline();

    await expect(openLessonOrCopy(target)).resolves.toEqual(opened);
  });

  it("go on past a lesson the server fails to give", async () => {
    const { copiedLessons, copyReadyLessons } = await fresh();
    graspy.failing.add("Number Systems");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await copyReadyLessons(PLAN, [ready(NUMBER_SYSTEMS), ready(FRACTIONS)]);

    expect(await copiedLessons()).toEqual([ready(FRACTIONS)]);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("go on past a lesson the server refuses, and say so", async () => {
    const { copiedLessons, copyReadyLessons } = await fresh();
    graspy.refusing.add("Number Systems");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await copyReadyLessons(PLAN, [ready(NUMBER_SYSTEMS), ready(FRACTIONS)]);

    expect(await copiedLessons()).toEqual([ready(FRACTIONS)]);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("stop at a server that cannot be reached, trying it once", async () => {
    const { copiedLessons, copyReadyLessons } = await fresh();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    goOffline();

    await expect(
      copyReadyLessons(PLAN, [ready(NUMBER_SYSTEMS), ready(FRACTIONS)]),
    ).rejects.toThrow();

    expect(graspy.connects).toBe(1);
    expect(console.warn).not.toHaveBeenCalled();
    expect(await copiedLessons()).toEqual([]);
  });

  it("are copied again once the record names a new lesson for the topic", async () => {
    const { copyReadyLessons, lessonTarget, openLessonOrCopy } = await fresh();
    await copyReadyLessons(PLAN, [ready(FRACTIONS)]);
    graspy.answers.lesson_progress = result("ready", true, "lesson-2");

    await copyReadyLessons(PLAN, [ready(FRACTIONS, "lesson-2")]);

    goOffline();
    const copy = await openLessonOrCopy(lessonTarget(PLAN, MATHS, 1)!);
    expect(copy.toolResult).toEqual(result("ready", true, "lesson-2"));
  });

  it("know the lesson the learner opened, so a run asks nothing of it", async () => {
    const { copyReadyLessons, lessonTarget, openLessonOrCopy } = await fresh();
    await openLessonOrCopy(lessonTarget(PLAN, MATHS, 1)!);
    graspy.called = [];

    await copyReadyLessons(PLAN, [ready(FRACTIONS)]);

    expect(graspy.called).toEqual([]);
  });

  it("take the record's lesson for a server that does not name it", async () => {
    const { copiedLessons, copyReadyLessons } = await fresh();
    graspy.answers.lesson_progress = result("ready", true, null);

    await copyReadyLessons(PLAN, [ready(FRACTIONS)]);

    expect(await copiedLessons()).toEqual([ready(FRACTIONS)]);
  });

  it("ask once more for a copy kept before copies named their lesson", async () => {
    const { copyReadyLessons, LESSON_COPY_STORE, openDB, promisify } =
      await fresh();
    const db = await openDB();
    const store = db
      .transaction(LESSON_COPY_STORE, "readwrite")
      .objectStore(LESSON_COPY_STORE);
    await promisify(
      store.put({ ...FRACTIONS, card: card("ready"), savedAt: 1 }),
    );

    await copyReadyLessons(PLAN, [ready(FRACTIONS)]);
    await copyReadyLessons(PLAN, [ready(FRACTIONS)]);

    expect(graspy.called).toEqual(["lesson_progress"]);
  });

  it("do not ask again for a lesson the server no longer has, even a copy kept before copies named their lesson", async () => {
    const { copyReadyLessons, LESSON_COPY_STORE, openDB, promisify } =
      await fresh();
    const db = await openDB();
    const store = db
      .transaction(LESSON_COPY_STORE, "readwrite")
      .objectStore(LESSON_COPY_STORE);
    await promisify(
      store.put({ ...FRACTIONS, card: card("ready"), savedAt: 1 }),
    );
    graspy.answers.lesson_progress = result("failed", false);

    await copyReadyLessons(PLAN, [ready(FRACTIONS)]);
    await copyReadyLessons(PLAN, [ready(FRACTIONS)]);

    expect(graspy.called).toEqual(["lesson_progress"]);
  });

  it("ask again for a lesson the server no longer had once the record names a new one", async () => {
    const { copyReadyLessons } = await fresh();
    graspy.answers.lesson_progress = result("failed", false);
    await copyReadyLessons(PLAN, [ready(FRACTIONS)]);

    await copyReadyLessons(PLAN, [ready(FRACTIONS, "lesson-2")]);

    expect(graspy.called).toEqual(["lesson_progress", "lesson_progress"]);
  });

  it("ask again for a lesson the server no longer had once the learner opens it", async () => {
    const { copyReadyLessons, lessonTarget, openLessonOrCopy } = await fresh();
    graspy.answers.lesson_progress = result("failed", false);
    await copyReadyLessons(PLAN, [ready(FRACTIONS)]);
    graspy.answers.give_lesson = result("making");
    await openLessonOrCopy(lessonTarget(PLAN, MATHS, 1)!);
    graspy.called = [];

    await copyReadyLessons(PLAN, [ready(FRACTIONS)]);

    expect(graspy.called).toEqual(["lesson_progress"]);
  });

  it("ask nothing for a lesson marked ready only on this device, and keep its copy", async () => {
    const { copiedLessons, copyReadyLessons, keepIfWhole, lessonTarget } =
      await fresh();
    await keepIfWhole(lessonTarget(PLAN, MATHS, 1)!, card("ready"));

    await copyReadyLessons(PLAN, [ready(FRACTIONS, "on-this-device")]);

    expect(graspy.called).toEqual([]);
    expect(await copiedLessons()).toEqual([ready(FRACTIONS)]);
  });

  it("keep only a lesson the server has whole", async () => {
    const { copiedLessons, copyReadyLessons } = await fresh();
    graspy.answers.lesson_progress = result("ready", false);

    await copyReadyLessons(PLAN, [ready(FRACTIONS)]);

    expect(await copiedLessons()).toEqual([]);
  });
});
