import { describe, expect, it } from "vitest";
import type { ChatMessage, ChatThread } from "@/lib/chat-db";
import contract from "./thread-contract.json";
import { pathOf, targetOf } from "./chat-links";
import {
  readChanges,
  sentMessage,
  sentThread,
  type ReadMessage,
} from "./thread-wire";

// apps/server/scripts/export_thread_contract.py writes the contract: what a device sends, and
// what the server's store returns for it.

const [TOPIC] = contract.sent.threads;

/** The contract's first thread as the web keeps it: links as the paths it opens. */
function keptHere(): { thread: ChatThread; messages: ChatMessage[] } {
  const thread: ChatThread = {
    id: TOPIC.id,
    scope: TOPIC.scope as ChatThread["scope"],
    agentContextId: TOPIC.agentContextId,
    preview: TOPIC.preview,
    createdAt: TOPIC.createdAt,
    updatedAt: TOPIC.updatedAt,
  };
  const messages = TOPIC.messages.map((message): ChatMessage => {
    const kept = message as { metadata?: object };
    const { link, ...metadata } = (kept.metadata ?? {}) as {
      link?: { label: string; to: unknown };
    };
    return {
      id: message.id,
      threadId: TOPIC.id,
      type: message.type as ChatMessage["type"],
      content: message.content,
      timestamp: message.timestamp,
      ...(message.editedAt !== message.timestamp
        ? { editedAt: message.editedAt }
        : {}),
      sender: message.type === "user" ? "user" : "ai",
      metadata: {
        ...metadata,
        ...(link ? { link: { label: link.label, to: pathOf(link.to)! } } : {}),
      } as ChatMessage["metadata"],
    };
  });
  return { thread, messages };
}

describe("the server's thread contract", () => {
  it("is what the web sends of a conversation it keeps", () => {
    const { thread, messages } = keptHere();

    expect(sentThread(thread, messages)).toEqual(TOPIC);
  });

  it("leaves out a failure, a message still arriving and its streaming mark", () => {
    const { thread, messages } = keptHere();
    const failure: ChatMessage = {
      ...messages[0],
      id: "failed",
      type: "error",
      sender: "ai",
    };
    const streaming: ChatMessage = {
      ...messages[1],
      metadata: { ...messages[1].metadata, streaming: true },
    };

    const sent = sentThread(thread, [messages[0], failure, streaming]);

    expect(sent.messages.map((m) => m.id)).toEqual([
      messages[0].id,
      messages[1].id,
    ]);
    expect(sent.messages[1]).toEqual(TOPIC.messages[1]);
  });

  it("reads back each message as the web keeps it, and sends it again unchanged", () => {
    const read = readChanges(contract.changes);
    const sent = new Map(
      contract.sent.threads.flatMap((t) => t.messages).map((m) => [m.id, m]),
    );

    const messages = read.threads.flatMap((thread) => thread.messages);

    expect(messages).toHaveLength(sent.size);
    for (const message of messages) {
      const again = sentMessage({ ...message, threadId: "any" });
      expect(again).toEqual(sent.get(message.id));
    }
  });

  it("reads each thread's scope, context and preview", () => {
    const read = readChanges(contract.changes);
    const byId = new Map(read.threads.map((thread) => [thread.id, thread]));

    for (const thread of contract.sent.threads) {
      const { messages: _messages, ...rest } = thread;
      const { messages: _read, ...kept } = byId.get(thread.id)!;
      expect(kept).toEqual(rest);
    }
  });

  it("opens each link where the phone's would", () => {
    const read = readChanges(contract.changes);
    const links = read.threads
      .flatMap((thread) => thread.messages)
      .flatMap((message) =>
        message.metadata?.link ? [message.metadata.link] : [],
      );

    expect(links.map((link) => link.to).sort()).toEqual([
      "/app/learn/mathematics",
      "/app/learn/mathematics/lesson/3",
      "/app/learn/subjects",
    ]);
  });
});

describe("reading what the server sent", () => {
  const page = (messages: unknown[], thread: object = {}) => ({
    upTo: 3,
    next: null,
    threads: [
      {
        id: "t",
        scope: { kind: "general", planId: "p" },
        createdAt: 1,
        updatedAt: 2,
        messages,
        ...thread,
      },
    ],
  });
  const message = (fields: object = {}) => ({
    id: "m",
    type: "system",
    content: "Hi",
    timestamp: 5,
    ...fields,
  });

  it("refuses a page that is not one", () => {
    expect(() => readChanges({ threads: [] })).toThrow();
    expect(() => readChanges(null)).toThrow();
  });

  it("leaves out a thread whose scope it cannot read, and keeps the rest", () => {
    const read = readChanges({
      ...page([]),
      threads: [
        ...page([]).threads,
        { ...page([]).threads[0], id: "x", scope: { kind: "lesson" } },
      ],
    });

    expect(read.threads.map((t) => t.id)).toEqual(["t"]);
  });

  it("leaves out a message it cannot show", () => {
    const read = readChanges(
      page([message({ type: "error" }), message({ id: 5 }), message()]),
    );

    expect(read.threads[0].messages).toEqual([
      {
        id: "m",
        type: "system",
        content: "Hi",
        timestamp: 5,
        editedAt: 5,
        sender: "ai",
      } satisfies ReadMessage,
    ]);
  });

  it("drops only the parts of a message it cannot read", () => {
    const read = readChanges(
      page([
        message({
          metadata: {
            followUps: ["Next?", 3],
            card: { resourceUri: "https://evil.example" },
            viewCalls: [{ method: "tools/call" }],
            link: { label: "Somewhere", to: { type: "elsewhere" } },
            stopped: "yes",
          },
        }),
      ]),
    );

    expect(read.threads[0].messages[0].metadata).toEqual({
      followUps: ["Next?"],
    });
  });
});

describe("links between the web's paths and the phone's screens", () => {
  it.each([
    ["/app/learn/subjects", { type: "subjects" }],
    [
      "/app/learn/basic%20science",
      { type: "subject", subjectSlug: "basic science" },
    ],
    [
      "/app/learn/mathematics/lesson/0",
      { type: "lesson", subjectSlug: "mathematics", topicIndex: 0 },
    ],
  ])("%s is one place on both", (path, target) => {
    expect(targetOf(path)).toEqual(target);
    expect(pathOf(target)).toBe(path);
  });

  it.each([
    "/app/learn",
    "/elsewhere",
    "/app/learn/%E0%A4%A/lesson/1",
    "/app/learn/mathematics/lesson/one",
  ])("%s is not a place to share", (path) => {
    expect(targetOf(path)).toBeNull();
  });

  it.each([
    null,
    { type: "lesson", subjectSlug: "mathematics", topicIndex: -1 },
    { type: "lesson", subjectSlug: "mathematics" },
    { type: "subject" },
    { type: "somewhere", subjectSlug: "mathematics" },
  ])("%j leads nowhere here", (target) => {
    expect(pathOf(target)).toBeNull();
  });
});
