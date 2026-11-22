// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { haptics } from "@/features/haptics/lib/haptics";
import { appCall } from "@/lib/a2a/request-data";
import type { ChatMessage } from "@/lib/chat-db";
import { useAppHost } from "./use-app-host";

const answer = { chosenIndex: 1, answerIndex: 1, question: "2 + 2?" };
const result = { content: [] };

function host(message: Partial<ChatMessage>) {
  const { result: hook } = renderHook(() =>
    useAppHost({ busy: false, ask: vi.fn(), keepViewCalls: vi.fn() }),
  );
  return hook.current(message as ChatMessage);
}

describe("a chat card's answers", () => {
  it("are felt when tapped, and not again when sent with the message", () => {
    const trigger = vi.spyOn(haptics, "trigger").mockImplementation(() => {});
    host({}).toolCalled("answer_practice", answer, result);
    expect(trigger).toHaveBeenCalledWith("correct");

    trigger.mockClear();
    const sent = appCall("answer_practice", answer);
    host({
      metadata: { viewCalls: [sent] },
    } as Partial<ChatMessage>).toolCalled("answer_practice", answer, result);
    expect(trigger).not.toHaveBeenCalled();
  });

  it("feel wrong for a wrong option, and nothing for another tool", () => {
    const trigger = vi.spyOn(haptics, "trigger").mockImplementation(() => {});
    const view = host({});
    view.toolCalled("answer_practice", { ...answer, chosenIndex: 0 }, result);
    expect(trigger).toHaveBeenCalledWith("wrong");
    trigger.mockClear();
    view.toolCalled("save_note", answer, result);
    expect(trigger).not.toHaveBeenCalled();
  });
});
