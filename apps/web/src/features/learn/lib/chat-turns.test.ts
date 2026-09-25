import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-db";
import { groupTurns } from "./chat-turns";

const message = (id: string, sender: "user" | "ai"): ChatMessage => ({
  id,
  threadId: "thread-1",
  sender,
  type: sender === "user" ? "user" : "system",
  content: id,
  timestamp: 0,
});

describe("groupTurns", () => {
  it("starts a turn at each question and gathers its answers", () => {
    const turns = groupTurns([
      message("welcome", "ai"),
      message("q1", "user"),
      message("a1", "ai"),
      message("note", "ai"),
      message("q2", "user"),
    ]);

    expect(
      turns.map((turn) => [turn.id, turn.messages.map((m) => m.id)]),
    ).toEqual([
      ["welcome", ["welcome"]],
      ["q1", ["q1", "a1", "note"]],
      ["q2", ["q2"]],
    ]);
  });
});
