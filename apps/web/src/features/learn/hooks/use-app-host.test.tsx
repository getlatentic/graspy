// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { haptics } from "@/features/haptics/lib/haptics";
import { appCall } from "@/lib/a2a/request-data";
import type { ChatMessage } from "@/lib/chat-db";
import { useAppHost } from "./use-app-host";

const answer = (key: string, over = {}) => ({
  key,
  chosenIndex: 1,
  answerIndex: 1,
  question: "2 + 2?",
  ...over,
});

function host(message: Partial<ChatMessage>) {
  const { result: hook } = renderHook(() =>
    useAppHost({ busy: false, ask: vi.fn(), keepViewCalls: vi.fn() }),
  );
  return hook.current(message as ChatMessage);
}

const felt = () => vi.spyOn(haptics, "trigger").mockImplementation(() => {});

describe("a chat card's answers", () => {
  it("are felt as the tap arrives, and not again when sent with the message", () => {
    const trigger = felt();
    const view = host({});
    view.toolCalling?.("answer_practice", answer("v1:0"));
    expect(trigger).toHaveBeenCalledWith("correct");

    view.toolCalling?.("answer_practice", answer("v1:0"));
    expect(trigger).toHaveBeenCalledOnce();
  });

  it("are not felt again when the message already holds them from an earlier visit", () => {
    const trigger = felt();
    const kept = appCall("answer_practice", answer("v2:0"));
    host({
      metadata: { viewCalls: [kept] },
    } as Partial<ChatMessage>).toolCalling?.("answer_practice", answer("v2:0"));
    expect(trigger).not.toHaveBeenCalled();
  });

  it("feel wrong for a wrong option, and nothing for another tool", () => {
    const trigger = felt();
    const view = host({});
    view.toolCalling?.("answer_practice", answer("v3:0", { chosenIndex: 0 }));
    expect(trigger).toHaveBeenCalledWith("wrong");
    trigger.mockClear();
    view.toolCalling?.("save_note", answer("v3:1"));
    expect(trigger).not.toHaveBeenCalled();
  });
});
