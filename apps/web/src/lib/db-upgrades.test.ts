import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  messageForSending,
  messageInCurrentShape,
  messageWithQuestionSet,
  messageWithViewCard,
  threadForSending,
} from "@/lib/db-upgrades";
import type {
  LearntTopic,
  PracticeRecord,
  StoredLesson,
} from "@/lib/learning-records";
import type { TopicRef } from "@/lib/learner-record";

// A fresh module per test: the app keeps one connection for the tab's lifetime.
async function storage() {
  vi.resetModules();
  return {
    ...(await import("@/lib/idb")),
    ...(await import("@/lib/curriculum-db")),
    ...(await import("@/lib/chat-db")),
    ...(await import("@/lib/lesson-copies")),
    ...(await import("@/lib/threads/thread-store")),
  };
}

type Storage = Awaited<ReturnType<typeof storage>>;

async function kept<T>(db: Storage, name: string): Promise<T[]> {
  const connection = await db.openDB();
  return db.promisify<T[]>(
    connection.transaction(name, "readonly").objectStore(name).getAll(),
  );
}

const refOf = ({ planId, subjectSlug, topicIndex, topic }: TopicRef) => ({
  planId,
  subjectSlug,
  topicIndex,
  topic,
});

async function planMarks(db: Storage) {
  const inPlan = (records: TopicRef[]) =>
    records.filter((record) => record.planId === PLAN_ID).map(refOf);
  return {
    learnt: inPlan(await kept<LearntTopic>(db, db.PROGRESS_STORE)),
    ready: inPlan(await kept<StoredLesson>(db, db.LESSON_STORE)),
  };
}

async function getLesson(db: Storage, ref: TopicRef) {
  const same = JSON.stringify(refOf(ref));
  const lessons = await kept<StoredLesson>(db, db.LESSON_STORE);
  return lessons.find((lesson) => JSON.stringify(refOf(lesson)) === same);
}

const practiceIn = (db: Storage) => kept<PracticeRecord>(db, db.PRACTICE_STORE);

function fakeLocalStorage(entries: Record<string, string>) {
  const kept: Record<string, string> = { ...entries };
  Object.defineProperties(kept, {
    getItem: { value: (key: string) => kept[key] ?? null },
    setItem: { value: (key: string, value: string) => (kept[key] = value) },
    removeItem: { value: (key: string) => delete kept[key] },
  });
  vi.stubGlobal("localStorage", kept);
  return kept;
}

interface Seed {
  plan?: object;
  lessons?: object[];
  messages?: object[];
  practice?: object[];
  copies?: object[];
}

function createStores(db: IDBDatabase, version: number): void {
  db.createObjectStore("curriculum", { keyPath: "id" });
  const chat = db.createObjectStore("chat-history", { keyPath: "id" });
  chat.createIndex("timestamp", "timestamp");
  if (version < 2) return;
  chat.createIndex("threadId", "threadId");
  db.createObjectStore("chat-threads", { keyPath: "id" });
  if (version < 3) return;
  const byPlan = {
    lessons: TOPIC_KEY,
    progress: TOPIC_KEY,
    practice: "messageId",
  };
  for (const [name, keyPath] of Object.entries(byPlan)) {
    if (name === "practice" && version < 5) continue;
    const store = db.createObjectStore(name, { keyPath });
    store.createIndex("plan", "planId");
    store.createIndex("subject", ["planId", "subjectSlug"]);
  }
  if (version < 8) return;
  db.createObjectStore("lesson-copies", { keyPath: TOPIC_KEY });
  db.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
  if (version < 9) return;
  db.createObjectStore("voice-answers", { keyPath: "key" });
}

function fill(tx: IDBTransaction, version: number, seed: Seed): void {
  const put = (name: string, records: object[] = []) =>
    records.forEach((record) => tx.objectStore(name).put(record));
  put("curriculum", seed.plan ? [seed.plan] : []);
  put("chat-history", seed.messages);
  if (version >= 2) put("chat-threads", [THREAD]);
  put("lessons", seed.lessons);
  put("practice", seed.practice);
  if (version >= 8) put("lesson-copies", seed.copies);
}

async function seed(version: number, seed: Seed = {}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("graspy-db", version);
    request.onupgradeneeded = () => {
      createStores(request.result, version);
      fill(request.transaction!, version, seed);
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

const TOPIC_KEY = ["planId", "subjectSlug", "topicIndex", "topic"];
const TOPICS = ["Number Systems", "Fractions", "Algebra"];
const LEGACY_PLAN = {
  id: "current",
  country: "NG",
  language: "en",
  gradeLevel: "Grade 7",
  subjects: ["Mathematics", "Basic Science"],
  topics: { Mathematics: TOPICS, "Basic Science": ["Cells"] },
  assessment: { nextSubject: "Basic Science" },
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};
const PLAN_ID = "plan-1700000000000";
const THREAD = {
  id: "thread-1",
  scope: {
    kind: "topic",
    planId: PLAN_ID,
    subjectSlug: "mathematics",
    topic: "Fractions",
  },
  createdAt: 0,
  updatedAt: 0,
};
const LESSON = {
  title: "Fractions",
  slides: [{ title: "Parts", bodyMd: "A fraction is part of a whole." }],
};
const SESSION = { id: "s1" };

const oldLesson = (topic: string, format = 3, lesson: object = LESSON) =>
  JSON.stringify({ topic, lesson, session: SESSION, savedAt: 5, format });

const ref = (topicIndex: number) => ({
  planId: PLAN_ID,
  subjectSlug: "mathematics",
  topicIndex,
  topic: TOPICS[topicIndex],
});

const message = (id: string, timestamp: number, metadata?: object) => ({
  id,
  threadId: "thread-1",
  type: "system",
  sender: "ai",
  content: "Try this.",
  timestamp,
  metadata,
});

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  fakeLocalStorage({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("version 2: chats kept per thread", () => {
  it("files the one earlier conversation under its own thread", async () => {
    const earlier = (id: string, timestamp: number) => ({
      id,
      type: "user",
      sender: "user",
      content: "Hi",
      timestamp,
    });
    await seed(1, { messages: [earlier("a", 10), earlier("b", 30)] });

    const db = await storage();

    expect(await db.listThreads()).toEqual([
      {
        id: "earlier",
        scope: { kind: "earlier" },
        createdAt: 10,
        updatedAt: 30,
      },
    ]);
    expect(await db.getThreadMessages("earlier")).toHaveLength(2);
  });
});

describe("version 3: learning moved from localStorage under the plan", () => {
  it("files lessons and progress under the plan, then forgets the old keys", async () => {
    await seed(2, { plan: LEGACY_PLAN });
    const local = fakeLocalStorage({
      "lesson-cache:mathematics:1": oldLesson("Fractions"),
      // Keyed by name, as an older version wrote it.
      "lesson-cache:Mathematics:0": oldLesson("Number Systems"),
      // The plan has another topic at this position now.
      "lesson-cache:mathematics:2": oldLesson("Geometry"),
      // A format the app does not render.
      "lesson-cache:english:0": oldLesson("Poetry", 2),
      "simple-topic-status:mathematics":
        '["completed","generated","completed"]',
      "topic-status:mathematics:0": "{}",
      graspy_tutor_thread: "ctx-1",
      "graspy.profile": "kept",
    });

    const db = await storage();

    const marks = await planMarks(db);
    expect(marks.learnt).toEqual([ref(0), ref(2)]);
    expect(marks.ready).toEqual([ref(0), ref(1)]);
    expect((await getLesson(db, ref(1)))?.lesson).toEqual(LESSON);
    expect(Object.keys(local)).toEqual(["graspy.profile"]);
  });

  it("drops the old keys when there is no plan to file them under", async () => {
    const local = fakeLocalStorage({
      "lesson-cache:mathematics:0": oldLesson("Number Systems"),
      "simple-topic-status:mathematics": '["completed"]',
    });

    const db = await storage();

    expect(await planMarks(db)).toEqual({ learnt: [], ready: [] });
    expect(Object.keys(local)).toEqual([]);
  });

  it("repairs only the broken bold of lessons saved before the server fixed it", async () => {
    await seed(2, { plan: LEGACY_PLAN });
    const bodies = [
      "using binary code.**\nKey Points:**\n- Base 10",
      "**Base-10** uses ten digits.\n**Binary** uses two.",
      "Say **yes**\nand **no** to it.",
      "A plain paragraph.\n\nAnother one.",
    ];
    const slides = bodies.map((bodyMd) => ({ title: "Parts", bodyMd }));
    fakeLocalStorage({
      "lesson-cache:mathematics:1": oldLesson("Fractions", 3, { slides }),
    });

    const db = await storage();

    const repaired = (await getLesson(db, ref(1)))?.lesson.slides;
    expect(repaired?.map((slide) => slide.bodyMd)).toEqual([
      "using binary code.\n\n**Key Points:**\n- Base 10",
      ...bodies.slice(1),
    ]);
  });
});

describe("version 4: the plan rewritten in its current shape", () => {
  it("gives subjects slugs, keys topics and the next subject by slug, and adds a plan id", async () => {
    await seed(2, { plan: LEGACY_PLAN });

    const db = await storage();

    expect(await db.getCurriculum()).toMatchObject({
      planId: PLAN_ID,
      subjects: [
        { name: "Mathematics", slug: "mathematics" },
        { name: "Basic Science", slug: "basic-science" },
      ],
      topics: { mathematics: TOPICS, "basic-science": ["Cells"] },
      assessment: { nextSubject: "basic-science" },
    });
  });

  it("rewrites the plan on a device already past version 3", async () => {
    const lesson = { ...ref(1), lesson: LESSON, session: SESSION, savedAt: 1 };
    await seed(3, { plan: LEGACY_PLAN, lessons: [lesson] });
    // Version 3 ran already: anything still in localStorage is not its to move.
    const local = fakeLocalStorage({ "lesson-cache:mathematics:0": "{}" });

    const db = await storage();

    expect(await db.getCurriculum()).toMatchObject({
      planId: PLAN_ID,
      subjects: [{ name: "Mathematics", slug: "mathematics" }, {}],
    });
    expect(await getLesson(db, ref(1))).toMatchObject({ lesson: LESSON });
    expect(Object.keys(local)).toEqual(["lesson-cache:mathematics:0"]);
  });
});

const OLD_CARD = {
  type: "practice",
  question: "3/8 as a decimal?",
  options: ["0.375", "0.35"],
  answerIndex: 0,
  correctFeedback: "Right.",
  incorrectFeedback: "Divide.",
  hint: "",
};
const { type: _type, ...QUESTION } = OLD_CARD;
const OLD_ANSWER = {
  question: "3/8 as a decimal?",
  options: ["0.375", "0.35"],
  answerIndex: 0,
  chosenIndex: 1,
};

function viewCard(messageId: string) {
  return {
    resourceUri: "ui://graspy/practice",
    toolName: "give_practice",
    toolInput: {},
    toolResult: {
      content: [{ type: "text", text: "3/8 as a decimal?" }],
      structuredContent: QUESTION,
      _meta: { viewUUID: messageId },
    },
  };
}

function setCard(messageId: string) {
  const card = viewCard(messageId);
  const questions = [card.toolResult.structuredContent];
  return {
    ...card,
    toolResult: {
      ...card.toolResult,
      structuredContent: { instruction: "", questions },
    },
  };
}

const practiceRecord = (
  messageId: string,
  correct: boolean,
  answeredAt: number,
) => ({
  messageId,
  planId: PLAN_ID,
  subjectSlug: "mathematics",
  topic: "Fractions",
  question: "3/8 as a decimal?",
  correct,
  answeredAt,
});

const answerCall = (answer: object) => ({
  jsonrpc: "2.0",
  id: 0,
  method: "tools/call",
  params: { name: "answer_practice", arguments: answer },
});

describe("version 5: practice cards and answers in MCP Apps' shape, and the practice record", () => {
  it("rewrites a card, its state and answer, and records the answered card", async () => {
    await seed(4, {
      messages: [
        message("m1", 10, {
          followUps: ["More?"],
          practice: OLD_CARD,
          practiceChosen: 1,
        }),
        message("m2", 20, { practiceAnswer: OLD_ANSWER }),
      ],
    });

    const db = await storage();

    const [card, question] = await db.getThreadMessages("thread-1");
    // Versions 6 and 7 follow in the same upgrade.
    expect(card.metadata).toEqual({
      followUps: ["More?"],
      card: setCard("m1"),
      viewCalls: [answerCall(OLD_ANSWER)],
    });
    expect(question.metadata).toEqual({ appCalls: [answerCall(OLD_ANSWER)] });
    expect(await practiceIn(db)).toEqual([practiceRecord("m1", false, 10)]);
  });
});

describe("version 6: a card is the tool call and result its view is sent", () => {
  it("rewrites a card, and the option chosen as its view's call", async () => {
    const card = {
      resourceUri: "ui://graspy/practice",
      toolName: "give_practice",
      structuredContent: QUESTION,
    };
    await seed(5, {
      messages: [
        message("answered", 10, { card, cardState: { chosen: 0 } }),
        message("open", 20, { card }),
      ],
    });

    const db = await storage();

    const [answered, open] = await db.getThreadMessages("thread-1");
    expect(answered.metadata).toEqual({
      card: setCard("answered"),
      viewCalls: [answerCall({ ...OLD_ANSWER, chosenIndex: 0 })],
    });
    expect(open.metadata).toEqual({ card: setCard("open") });
  });
});

describe("version 7: practice in sets, and a record for each question", () => {
  it("rewrites a card as a set of one, and keys records per question", async () => {
    const record = practiceRecord("m6", true, 5);
    await seed(6, {
      messages: [message("m6", 10, { card: viewCard("m6") })],
      practice: [record],
    });

    const db = await storage();

    const [stored] = await db.getThreadMessages("thread-1");
    expect(stored.metadata).toEqual({ card: setCard("m6") });
    expect(await practiceIn(db)).toEqual([record]);
    const connection = await db.openDB();
    await db.promisify(
      connection
        .transaction(db.PRACTICE_STORE, "readwrite")
        .objectStore(db.PRACTICE_STORE)
        .put({ ...record, question: "1/4 as a decimal?" }),
    );
    expect(await practiceIn(db)).toHaveLength(2);
  });
});

describe("version 10: lesson copies indexed by the lesson each holds", () => {
  it("lists the copies already on the device, one kept before copies named their lesson", async () => {
    const card = { resourceUri: "ui://graspy/lesson", toolName: "give_lesson" };
    await seed(9, {
      copies: [
        { ...ref(1), card, savedAt: 1, lessonId: "lesson-1" },
        { ...ref(2), card, savedAt: 1 },
      ],
    });

    const db = await storage();

    expect(await db.copiedLessons()).toEqual([
      { ...ref(1), lessonId: "lesson-1" },
      { ...ref(2), lessonId: null },
    ]);
  });
});

describe("version 11: conversations kept until the server has them", () => {
  it("marks each conversation and what it shows to be sent, and finds it by scope", async () => {
    const said = { ...message("said", 2), type: "user", sender: "user" };
    const failed = { ...message("failed", 3), type: "error" };
    await seed(10, { messages: [message("answer", 1), said, failed] });

    const db = await storage();

    const [unsent, ...others] = await db.unsentThreads();
    expect(others).toEqual([]);
    expect(unsent.thread).toEqual(THREAD);
    expect(unsent.messages.map((m) => m.id).sort()).toEqual(["answer", "said"]);
    const found = await db.keepThreadFor({
      ...THREAD,
      scope: { ...THREAD.scope, kind: "topic" },
      id: "thread-2",
    });
    expect(found.id).toBe(THREAD.id);
    expect(await db.listThreads()).toEqual([THREAD]);
  });

  it("marks messages as the earlier steps rewrote them, upgrading from the first version", async () => {
    const said = (id: string, timestamp: number) => ({
      id,
      type: "user",
      sender: "user",
      content: "Hi",
      timestamp,
    });
    await seed(1, { messages: [said("a", 10), said("b", 30)] });

    const db = await storage();

    const [earlier] = await db.unsentThreads();
    expect(earlier.thread.id).toBe("earlier");
    expect(earlier.messages.map((m) => [m.id, m.threadId])).toEqual([
      ["a", "earlier"],
      ["b", "earlier"],
    ]);
    expect(await db.getThreadMessages("earlier")).toHaveLength(2);
  });

  it("leaves a thread whose scope no version wrote unmarked, found by no scope", () => {
    const odd = { id: "odd", scope: { kind: "lesson" }, createdAt: 0 };

    expect(threadForSending(odd)).toBe(odd);
    expect(threadForSending({ id: "none" })).toEqual({ id: "none" });
    expect(threadForSending(THREAD)).toEqual({
      ...THREAD,
      scopeKey: `topic\u0000${PLAN_ID}\u0000mathematics\u0000Fractions`,
      unsent: 1,
    });
  });

  it.each(["error", "status", undefined])(
    "keeps a %s message to this device",
    (type) => {
      const kept = { id: "m", type };
      expect(messageForSending(kept)).toBe(kept);
    },
  );
});

// The upgrade writes back only the messages a step returned anew.
it.each([
  ["version 5", messageInCurrentShape, { followUps: [] }],
  ["version 6", messageWithViewCard, { card: viewCard("m"), followUps: [] }],
  ["version 7", messageWithQuestionSet, { card: setCard("m") }],
] as const)(
  "%s leaves a message already in shape as it was",
  (_, step, metadata) => {
    const stored = { id: "m", threadId: "t", timestamp: 1, metadata };
    expect(step(stored)).toBe(stored);
  },
);
