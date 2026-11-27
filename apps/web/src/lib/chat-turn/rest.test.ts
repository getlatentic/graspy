import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchForChat = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/chat-session", () => ({ fetchForChat }));

import { ApiError } from "@/lib/api/errors";
import { startTurn } from "./rest";

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

beforeEach(() => fetchForChat.mockReset());

describe("startTurn", () => {
  it("asks once, not again, when a visitor is past the limits, as a retry cannot pass", async () => {
    fetchForChat.mockResolvedValue(
      answer(429, { detail: { code: "try_limit", error: "limit" } }),
    );

    const failure = await startTurn("chat-1", "turn-1", {
      parts: [],
      metadata: {},
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(fetchForChat).toHaveBeenCalledOnce();
  });

  it("asks again after a plain 429, which is a blip", async () => {
    fetchForChat.mockResolvedValueOnce(answer(429, {}));
    fetchForChat.mockResolvedValueOnce(answer(200, { turn: "t", cursor: 1 }));

    await expect(
      startTurn("chat-1", "turn-1", { parts: [], metadata: {} }),
    ).resolves.toEqual({ turn: "t", cursor: 1 });
    expect(fetchForChat).toHaveBeenCalledTimes(2);
  });
});
