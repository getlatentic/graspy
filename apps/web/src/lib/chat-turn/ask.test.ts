import { beforeEach, describe, expect, it, vi } from "vitest";

const { startTurn, stopTurn, askAgent, followTurn } = vi.hoisted(() => ({
  startTurn: vi.fn(),
  stopTurn: vi.fn(),
  askAgent: vi.fn(),
  followTurn: vi.fn(),
}));

vi.mock("./rest", async (importActual) => ({
  ...(await importActual<typeof import("./rest")>()),
  startTurn,
  stopTurn,
}));
vi.mock("./follow", async (importActual) => ({
  ...(await importActual<typeof import("./follow")>()),
  followTurn,
}));
vi.mock("@/lib/a2a/client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/a2a/client")>()),
  askAgent,
}));

import { TurnStopped } from "@/lib/a2a/client";
import { ApiError } from "@/lib/api/errors";
import { askTurn, server } from "./ask";
import { ChatGone, Left, type Follow } from "./follow";
import type { Finished } from "./frames";
import { TurnsUnavailable } from "./rest";

const finished = (extra: Partial<Finished> = {}): Finished => ({
  seq: 9,
  prev: 8,
  kind: "turn.finished",
  status: "ok",
  reply: { answer: " Forty-two ", data: { followUps: ["Again?"] } },
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  server.keepsTurns = true;
  startTurn.mockResolvedValue({ turn: "t", cursor: 4 });
  stopTurn.mockResolvedValue(undefined);
  followTurn.mockResolvedValue(finished());
});

describe("askTurn", () => {
  it("starts the turn in the learner's chat with their message and context, then follows it", async () => {
    const reply = await askTurn({
      text: "What is 6 x 7?",
      contextId: "chat-1",
      learner: { subject: "Maths" },
      unanswered: ["Hello?"],
    });

    const [chat, turn, body] = startTurn.mock.calls[0];
    expect(chat).toBe("chat-1");
    expect(turn).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).toEqual({
      parts: [{ text: "What is 6 x 7?" }, { data: { unanswered: ["Hello?"] } }],
      metadata: { learner: { subject: "Maths" } },
    });
    expect(followTurn.mock.calls[0][0].cursor).toBe(4);
    expect(reply).toMatchObject({
      text: "Forty-two",
      contextId: "chat-1",
      followUps: ["Again?"],
    });
    expect(reply.stopped).toBeUndefined();
  });

  it("names a chat for a conversation that has none, and gives it back", async () => {
    const reply = await askTurn({ text: "Hi" });

    expect(reply.contextId).toMatch(/^[0-9a-f-]{36}$/);
    expect(startTurn.mock.calls[0][0]).toBe(reply.contextId);
  });

  it("hands the page the words, the activity and the reconnecting of the turn", async () => {
    const listener = {
      onDelta: vi.fn(),
      onRestart: vi.fn(),
      onActivity: vi.fn(),
      onReconnecting: vi.fn(),
    };
    followTurn.mockImplementationOnce(async ({ listener: frames }: Follow) => {
      frames.onText("Fort");
      frames.onRestart();
      frames.onActivity("calculate");
      frames.onReconnecting(true);
      return finished();
    });

    await askTurn({ text: "Hi" }, listener);

    expect(listener.onDelta).toHaveBeenCalledWith("Fort");
    expect(listener.onRestart).toHaveBeenCalled();
    expect(listener.onActivity).toHaveBeenCalledWith("calculate");
    expect(listener.onReconnecting).toHaveBeenCalledWith(true);
  });

  it("asks over A2A, from then on, when the server keeps no turns", async () => {
    startTurn.mockRejectedValue(new TurnsUnavailable());
    askAgent.mockResolvedValue({ text: "Old way" });

    const first = await askTurn({ text: "Hi" });
    const second = await askTurn({ text: "Again" });

    expect([first.text, second.text]).toEqual(["Old way", "Old way"]);
    expect(startTurn).toHaveBeenCalledOnce();
    expect(askAgent).toHaveBeenCalledTimes(2);
  });

  it("reports a turn that failed as a problem a later try may not repeat", async () => {
    followTurn.mockResolvedValue(
      finished({ status: "failed", cause: "no_progress", reply: undefined }),
    );

    const failure = await askTurn({ text: "Hi" }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).retryable).toBe(true);
    expect((failure as ApiError).message).toMatch(/no_progress/);
  });

  it("reports a chat that is gone", async () => {
    followTurn.mockRejectedValue(new ChatGone());

    await expect(askTurn({ text: "Hi" })).rejects.toBeInstanceOf(ApiError);
  });

  it("sends the learner's stop and returns the words the turn ended with", async () => {
    const stop = new AbortController();
    followTurn.mockImplementationOnce(async () => {
      stop.abort();
      return finished({
        status: "stopped",
        reply: { answer: "Forty", data: {} },
      });
    });

    const reply = await askTurn(
      { text: "Hi", contextId: "chat-1" },
      { signal: stop.signal },
    );

    expect(stopTurn).toHaveBeenCalledWith("chat-1", startTurn.mock.calls[0][1]);
    expect(reply).toMatchObject({ text: "Forty", stopped: true });
  });

  it("shows what it has when the stop cannot be sent", async () => {
    const stop = new AbortController();
    stopTurn.mockRejectedValue(new ApiError("offline", 0));
    followTurn.mockImplementationOnce(async ({ signal }: Follow) => {
      stop.abort();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(signal.aborted).toBe(true);
      throw new Left();
    });

    await expect(
      askTurn({ text: "Hi" }, { signal: stop.signal }),
    ).rejects.toBeInstanceOf(TurnStopped);
  });
});
