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

describe("a choice card's tap", () => {
  const hostWith = (
    busy: boolean,
    ask = vi.fn(),
    message: Partial<ChatMessage> = {},
    lastMessageId?: string,
  ) => {
    const { result } = renderHook(() =>
      useAppHost({ busy, lastMessageId, ask, keepViewCalls: vi.fn() }),
    );
    return result.current(message as ChatMessage);
  };
  const choice = (id: string) =>
    ({
      id,
      metadata: { card: { resourceUri: "ui://graspy/choice" } },
    }) as Partial<ChatMessage>;

  it("is the learner's message, as they would have typed it", () => {
    const ask = vi.fn();

    expect(hostWith(false, ask).message("JSS 2")).toBe(true);

    expect(ask).toHaveBeenCalledWith("JSS 2", []);
  });

  it("is refused while the tutor is still answering, so the card says to wait", () => {
    const ask = vi.fn();

    expect(hostWith(true, ask).message("JSS 2")).toBe(false);

    expect(ask).not.toHaveBeenCalled();
  });

  it("is refused once the conversation has gone on past its card, so an old card cannot answer", () => {
    const ask = vi.fn();

    expect(hostWith(false, ask, choice("m1"), "m3").message("JSS 3")).toBe(
      false,
    );
    expect(hostWith(false, ask, choice("m3"), "m3").message("JSS 3")).toBe(
      true,
    );

    expect(ask).toHaveBeenCalledOnce();
  });

  it("is refused for the About you form too once the conversation has gone on past it", () => {
    const form = {
      id: "m1",
      metadata: { card: { resourceUri: "ui://graspy/details" } },
    } as Partial<ChatMessage>;

    expect(hostWith(false, vi.fn(), form, "m3").message("Country: x")).toBe(
      false,
    );
    expect(
      hostWith(false, vi.fn(), { ...form, id: "m3" }, "m3").message(
        "Country: x",
      ),
    ).toBe(true);
  });

  it("leaves another kind of card as it was", () => {
    const practice = {
      id: "m1",
      metadata: { card: { resourceUri: "ui://graspy/practice" } },
    } as Partial<ChatMessage>;

    expect(hostWith(false, vi.fn(), practice, "m3").message("Another")).toBe(
      true,
    );
  });
});
