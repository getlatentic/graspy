import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TurnStopped,
  type TutorReply,
  type TutorTurn,
  type TurnListener,
} from "@/lib/a2a/client";
import { ApiError } from "@/lib/api/errors";
import type { ChatMessage, NewChatMessage, ThreadScope } from "@/lib/chat-db";
import en from "@/locales/en.json";
import { MessageStore } from "./message-store";
import { runTurn, type TurnDeps } from "./tutor-turn";

const SCOPE: ThreadScope = {
  kind: "topic",
  planId: "plan-1",
  subjectSlug: "mathematics",
  topic: "Fractions",
};
const THREAD = {
  id: "thread-1",
  scope: SCOPE,
  createdAt: 0,
  updatedAt: 0,
};

const t = (key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (value, part) => (value as Record<string, unknown>)[part],
      en,
    ) as string;

let saved = 0;
const save = async (message: NewChatMessage): Promise<ChatMessage> => ({
  ...message,
  id: `saved-${++saved}`,
  timestamp: saved,
});

function turnWith(
  ask: (turn: TutorTurn, listener: TurnListener) => Promise<TutorReply>,
) {
  const messages = new MessageStore({
    load: async () => [],
    save,
    saveMetadata: async () => {},
  });
  const deps: TurnDeps = {
    store: messages,
    ensureThread: async () => THREAD,
    recordTurn: async () => {},
    learnerFor: async () => ({ topic: "Fractions" }),
    carryOut: async () => {},
    ask: (turn, listener = {}) => ask(turn, listener),
    save,
  };
  const run = (text: string) =>
    runTurn({ text, scope: SCOPE, t }, deps, {
      signal: new AbortController().signal,
      onThread: () => {},
      onActivity: () => {},
    });
  return { run, shown: () => messages.messagesOf(THREAD.id) };
}

const REPLY: TutorReply = {
  text: "0.375",
  contextId: "context-1",
  followUps: ["Try another?"],
  actions: [],
  cards: [
    {
      resourceUri: "ui://graspy/practice",
      toolName: "give_practice",
      toolInput: { question: "3/8 as a decimal?" },
      toolResult: { content: [] },
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (flush: () => void) => {
    queueMicrotask(flush);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a turn with the tutor", () => {
  it("keeps the question and the answer, with its follow-ups and card", async () => {
    const turn = turnWith(async (_, listener) => {
      listener.onDelta?.("0.3");
      listener.onDelta?.("75");
      return REPLY;
    });

    await turn.run("What is 3/8?");

    expect(turn.shown().map((m) => [m.sender, m.content])).toEqual([
      ["user", "What is 3/8?"],
      ["ai", "0.375"],
    ]);
    expect(turn.shown()[1].metadata).toEqual({
      followUps: ["Try another?"],
      card: REPLY.cards[0],
    });
  });

  it.each([
    [0, en.chat.temporaryProblem],
    [400, en.chat.tutorError],
  ])(
    "says a failure with status %i in the conversation",
    async (status, said) => {
      const turn = turnWith(async () => {
        throw new ApiError("Failed", status);
      });

      await turn.run("What is 3/8?");

      expect(turn.shown().map((m) => [m.type, m.content])).toEqual([
        ["user", "What is 3/8?"],
        ["error", said],
      ]);
    },
  );

  it("withdraws what streamed when the tutor writes the answer again", async () => {
    let shownBeforeEnd = "";
    const turn = turnWith(async (_, listener) => {
      listener.onDelta?.("| Example (------");
      listener.onRestart?.();
      listener.onDelta?.("Place value is ");
      await new Promise((resolve) => setTimeout(resolve));
      shownBeforeEnd = turn.shown()[1].content;
      throw new TurnStopped();
    });

    await turn.run("Explain place value");

    expect(shownBeforeEnd).toBe("Place value is ");
    expect(turn.shown()[1].content).toBe("Place value is");
  });
});
