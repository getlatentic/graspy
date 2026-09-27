import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatThread, ThreadScope } from "@/lib/chat-db";
import type { Reading } from "./threads-api";
import type { WireThread } from "./thread-wire";

type Signed = { uid: string; learner: { id: string } | null };
const ADA: Signed = { uid: "uid-1", learner: { id: "ada" } };
const GRACE: Signed = { uid: "uid-1", learner: { id: "grace" } };
let signedIn: Signed | null = ADA;
vi.mock("@/lib/account/account-store", () => ({
  currentAccount: () => signedIn,
  learnerKeyOf: (account: Signed) =>
    account.learner ? `${account.uid}/${account.learner.id}` : null,
}));

// The server as the device meets it: what it was sent, and the pages it answers with.
const server = {
  sent: [] as WireThread[][],
  reads: [] as Reading[],
  pages: [] as unknown[],
  seq: 0,
  failure: null as Error | null,
  // Runs as a request is answered, before the device reads the answer.
  meanwhile: null as (() => Promise<void> | void) | null,
};
vi.mock("./threads-api", async () => {
  const { LearnerChanged } = await import("@/lib/learner-pin");
  const { readChanges } = await import("./thread-wire");
  const answered = async (still?: () => boolean) => {
    if (still && !still()) throw new LearnerChanged();
    if (server.failure) throw server.failure;
    const meanwhile = server.meanwhile;
    server.meanwhile = null;
    await meanwhile?.();
  };
  return {
    sendThreads: async (threads: WireThread[], still?: () => boolean) => {
      await answered(still);
      server.sent.push(structuredClone(threads));
      server.seq += 1;
      return server.seq;
    },
    changedThreads: async (reading: Reading, still?: () => boolean) => {
      server.reads.push(reading);
      await answered(still);
      return readChanges(
        server.pages.shift() ?? { upTo: server.seq, threads: [], next: null },
      );
    },
  };
});

const FRACTIONS: ThreadScope = {
  kind: "topic",
  planId: "plan-1",
  subjectSlug: "mathematics",
  topic: "Fractions",
};

async function device() {
  vi.resetModules();
  return {
    ...(await import("@/lib/chat-db")),
    ...(await import("./thread-store")),
    ...(await import("./thread-sync")),
    ...(await import("@/lib/learner-pin")),
  };
}

type Device = Awaited<ReturnType<typeof device>>;

function fakeLocalStorage() {
  const kept = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => void kept.set(key, value),
      removeItem: (key: string) => void kept.delete(key),
    },
  });
  return kept;
}

let storage: Map<string, string>;

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  storage = fakeLocalStorage();
  signedIn = ADA;
  Object.assign(server, {
    sent: [],
    reads: [],
    pages: [],
    seq: 0,
    failure: null,
    meanwhile: null,
  });
});

afterEach(() => vi.unstubAllGlobals());

async function asked(db: Device, text: string, scope = FRACTIONS) {
  const now = Date.now();
  const thread = await db.keepThreadFor({
    id: `thread-${text}`,
    scope,
    createdAt: now,
    updatedAt: now,
  });
  const message = await db.saveChatMessage({
    threadId: thread.id,
    type: "user",
    content: text,
    sender: "user",
  });
  return { thread, message };
}

function page(threads: object[], fields: object = {}) {
  return { upTo: server.seq, threads, next: null, ...fields };
}

function serverThread(id: string, messages: object[], fields: object = {}) {
  return {
    id,
    scope: FRACTIONS,
    createdAt: 1,
    updatedAt: 2,
    messages,
    ...fields,
  };
}

function serverMessage(id: string, timestamp: number, fields: object = {}) {
  return {
    id,
    type: "system",
    content: `said ${id}`,
    timestamp,
    editedAt: timestamp,
    ...fields,
  };
}

describe("sending what this device has not sent", () => {
  it("sends a conversation once, then nothing more", async () => {
    const db = await device();
    const { thread, message } = await asked(db, "What is a half?");

    await db.syncThreads();
    await db.syncThreads();

    expect(server.sent).toHaveLength(1);
    const [[sent]] = server.sent;
    expect(sent).toMatchObject({ id: thread.id, scope: FRACTIONS });
    expect(sent.messages).toEqual([
      {
        id: message.id,
        type: "user",
        content: "What is a half?",
        timestamp: message.timestamp,
        editedAt: message.timestamp,
      },
    ]);
    expect(await db.unsentThreads()).toEqual([]);
  });

  it("sends what was said, or changed, while a send was under way", async () => {
    const db = await device();
    const { thread, message } = await asked(db, "First");
    const answered = { viewCalls: [] };
    server.meanwhile = async () => {
      await db.saveChatMessage({
        threadId: thread.id,
        type: "system",
        content: "Second",
        sender: "ai",
      });
      await db.saveMessageMetadata(message.id, answered, message.timestamp + 5);
    };

    await db.syncThreads();

    expect(server.sent).toHaveLength(2);
    const later = server.sent[1][0].messages;
    expect(later.map((m) => m.content).sort()).toEqual(["First", "Second"]);
    expect(later.find((m) => m.id === message.id)?.editedAt).toBe(
      message.timestamp + 5,
    );
    expect(await db.unsentThreads()).toEqual([]);
  });

  it("keeps a conversation had offline until it can be sent", async () => {
    const db = await device();
    await asked(db, "Offline");
    server.failure = new TypeError("Failed to fetch");

    await expect(db.sentEveryThread()).resolves.toBe(false);
    server.failure = null;
    await expect(db.sentEveryThread()).resolves.toBe(true);

    expect(server.sent).toHaveLength(1);
  });

  it("sends and reads nothing while no learner is chosen", async () => {
    signedIn = null;
    const db = await device();
    await asked(db, "Signed out");

    await db.syncThreads();

    await expect(db.sentEveryThread()).resolves.toBe(true);
    expect(server.sent).toEqual([]);
    expect(server.reads).toEqual([]);
    expect(await db.unsentThreads()).toHaveLength(1);
  });
});

describe("taking in what the learner's other devices sent", () => {
  it("shows another device's conversation with its history, read a page at a time", async () => {
    const db = await device();
    const heard = vi.fn();
    db.onThreadsTakenIn(heard);
    const link = {
      label: "Open lesson",
      to: { type: "lesson", subjectSlug: "mathematics", topicIndex: 2 },
    };
    server.seq = 7;
    server.pages = [
      page(
        [serverThread("t-phone", [serverMessage("m1", 10, { type: "user" })])],
        {
          next: "7.m1",
        },
      ),
      page([
        serverThread("t-phone", [
          serverMessage("m2", 20, { type: "complete", metadata: { link } }),
        ]),
      ]),
    ];

    await db.syncThreads();

    expect(server.reads).toEqual([
      { since: 0 },
      { since: 0, upTo: 7, after: "7.m1" },
    ]);
    const [thread] = await db.listThreads();
    expect(thread).toEqual({
      id: "t-phone",
      scope: FRACTIONS,
      createdAt: 1,
      updatedAt: 2,
    });
    const messages = await db.getThreadMessages("t-phone");
    expect(messages.map((m) => [m.id, m.sender])).toEqual([
      ["m1", "user"],
      ["m2", "ai"],
    ]);
    expect(messages[1].metadata?.link).toEqual({
      label: "Open lesson",
      to: "/app/learn/mathematics/lesson/2",
    });
    expect(heard).toHaveBeenCalledWith(new Set(["t-phone"]));
    expect(await db.unsentThreads()).toEqual([]);

    await db.syncThreads();
    expect(server.reads.at(-1)).toEqual({ since: 7 });
  });

  it("joins another device's copy of a conversation to this one's", async () => {
    const db = await device();
    const { thread } = await asked(db, "Asked here");
    // The phone's copy reached the server first, then this device's.
    server.seq = 1;
    server.pages = [
      page(
        [
          serverThread("t-phone", [serverMessage("m-phone", 1)], {
            agentContextId: "context-phone",
            preview: "Asked on the phone",
            updatedAt: 1,
          }),
        ],
        { upTo: 2 },
      ),
    ];

    await db.syncThreads();

    const threads = await db.listThreads();
    expect(threads.map((t) => t.id)).toEqual([thread.id]);
    expect(threads[0].agentContextId).toBe("context-phone");
    expect(threads[0].preview).toBeUndefined();
    const messages = await db.getThreadMessages(thread.id);
    expect(messages.map((m) => m.content)).toEqual([
      "said m-phone",
      "Asked here",
    ]);
  });

  it("finds another device's conversation when this one starts it later", async () => {
    const db = await device();
    server.seq = 1;
    server.pages = [page([serverThread("t-phone", [serverMessage("m1", 1)])])];
    await db.syncThreads();

    const started: ChatThread = await db.keepThreadFor({
      id: "thread-here",
      scope: FRACTIONS,
      createdAt: 5,
      updatedAt: 5,
    });

    expect(started.id).toBe("t-phone");
  });

  it("takes a later edit from another device, and not an earlier one", async () => {
    const db = await device();
    const { thread, message } = await asked(db, "Card");
    await db.saveMessageMetadata(message.id, { followUps: ["mine"] }, 50);
    await db.syncThreads();
    const edited = (at: number, followUps: string[]) =>
      page([
        serverThread(thread.id, [
          serverMessage(message.id, message.timestamp, {
            type: "user",
            content: "Card",
            editedAt: at,
            metadata: { followUps },
          }),
        ]),
      ]);

    server.pages = [edited(40, ["older"])];
    await db.syncThreads();
    const [kept] = await db.getThreadMessages(thread.id);
    server.pages = [edited(60, ["newer"])];
    await db.syncThreads();
    const [taken] = await db.getThreadMessages(thread.id);

    expect(kept.metadata).toEqual({ followUps: ["mine"] });
    expect(taken.metadata).toEqual({ followUps: ["newer"] });
    expect(taken.editedAt).toBe(60);
    expect(await db.unsentThreads()).toEqual([]);
  });

  it("reads everything again when the server's seq is behind what was read", async () => {
    const db = await device();
    storage.set(
      "graspy.threads.since",
      JSON.stringify({ learner: "uid-1/ada", since: 10 }),
    );
    server.seq = 3;

    await db.syncThreads();

    expect(server.reads.map((r) => r.since)).toEqual([10, 0]);
    expect(JSON.parse(storage.get("graspy.threads.since")!)).toEqual({
      learner: "uid-1/ada",
      since: 3,
    });
  });

  it("reads on from its own send when nothing else was written between", async () => {
    const db = await device();
    storage.set(
      "graspy.threads.since",
      JSON.stringify({ learner: "uid-1/ada", since: 4 }),
    );
    server.seq = 4;
    await asked(db, "Mine");

    await db.syncThreads();

    expect(server.reads).toEqual([{ since: 5 }]);
  });

  it("starts from nothing for another learner's since", async () => {
    const db = await device();
    storage.set(
      "graspy.threads.since",
      JSON.stringify({ learner: "uid-1/grace", since: 9 }),
    );

    await db.syncThreads();

    expect(server.reads).toEqual([{ since: 0 }]);
  });

  it("writes nothing on the device once it learns as someone else", async () => {
    const db = await device();
    server.seq = 1;
    server.pages = [page([serverThread("t-ada", [serverMessage("m1", 1)])])];
    server.meanwhile = () => {
      signedIn = GRACE;
    };

    await expect(db.syncThreads()).rejects.toBeInstanceOf(db.LearnerChanged);

    expect(await db.listThreads()).toEqual([]);
    expect(storage.has("graspy.threads.since")).toBe(false);
  });
});

describe("what one request carries", () => {
  const thread = (id: string): ChatThread => ({
    id,
    scope: { kind: "general", planId: id },
    createdAt: 1,
    updatedAt: 1,
  });
  const said = (threadId: string, n: number, content = "x") => ({
    id: `${threadId}-m${n}`,
    threadId,
    type: "user" as const,
    content,
    timestamp: n,
    sender: "user" as const,
  });

  it("splits a long conversation, each part under its thread", async () => {
    const db = await device();
    const long = Array.from({ length: 450 }, (_, n) => said("t", n));

    const batches = db.batches([{ thread: thread("t"), messages: long }]);

    expect(batches.map((b) => b.threads[0].messages.length)).toEqual([
      200, 200, 50,
    ]);
    expect(batches.every((b) => b.threads[0].id === "t")).toBe(true);
    expect(batches.flatMap((b) => b.sent[0].messages)).toEqual(long);
  });

  it("takes at most fifty threads and a million characters at once", async () => {
    const db = await device();
    const many = Array.from({ length: 60 }, (_, n) => ({
      thread: thread(`t${n}`),
      messages: [],
    }));
    const large = [
      { thread: thread("a"), messages: [said("a", 1, "y".repeat(600_000))] },
      { thread: thread("b"), messages: [said("b", 1, "y".repeat(600_000))] },
    ];

    expect(db.batches(many).map((b) => b.threads.length)).toEqual([50, 10]);
    expect(db.batches(large).map((b) => b.threads.map((t) => t.id))).toEqual([
      ["a"],
      ["b"],
    ]);
  });
});
