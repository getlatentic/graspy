import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ API_BASE_URL: "https://api.test/api" }));

const { fetchWithSession } = vi.hoisted(() => ({ fetchWithSession: vi.fn() }));
vi.mock("@/lib/api/session", () => ({
  fetchWithSession,
  getSessionToken: async () => "token",
  refreshSessionToken: async () => "fresh",
}));

import { ApiError } from "@/lib/api/errors";
import type { Frame } from "./frames";
import { eventsLink, LinkFailed, socketLink } from "./links";

const CHAT = "5b3f3a52-1c1e-4e0e-9f0e-2f5d6c9a7b11";
const TURN = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

class FakeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  closed = false;
  readonly url: string;
  readonly protocols: string[];
  constructor(url: string, protocols: string[]) {
    this.url = url;
    this.protocols = protocols;
  }
  send(text: string) {
    this.sent.push(text);
  }
  close() {
    this.closed = true;
  }
  receive(frame: unknown) {
    this.onmessage?.({
      data: typeof frame === "string" ? frame : JSON.stringify(frame),
    });
  }
}

function linkWith(sockets: FakeSocket[], now = () => Date.now()) {
  return socketLink(CHAT, TURN, {
    token: async (fresh) => (fresh ? "fresh" : "token"),
    open: (url, protocols) => {
      const socket = new FakeSocket(url, protocols);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    now,
  });
}

async function collected(frames: AsyncGenerator<Frame>) {
  const got: Frame[] = [];
  let failure: unknown;
  try {
    for await (const frame of frames) got.push(frame);
  } catch (error) {
    failure = error;
  }
  return { got, failure };
}

const nothing = () => new AbortController().signal;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("socketLink", () => {
  it("opens the turn's socket from the cursor, offering the session as a subprotocol", async () => {
    const sockets: FakeSocket[] = [];
    const frames = linkWith(sockets).frames(7, nothing());
    const reading = collected(frames);
    await tick();

    expect(sockets[0].url).toBe(
      `wss://api.test/api/chats/${CHAT}/turns/${TURN}/socket?after=7`,
    );
    expect(sockets[0].protocols).toEqual(["graspy.v1", "token"]);
    sockets[0].onclose?.();
    await reading;
  });

  it("offers a new token when it is asked to", async () => {
    const sockets: FakeSocket[] = [];
    const link = socketLink(
      CHAT,
      TURN,
      {
        token: async (fresh) => (fresh ? "fresh" : "token"),
        open: (url, protocols) => {
          const socket = new FakeSocket(url, protocols);
          sockets.push(socket);
          return socket as unknown as WebSocket;
        },
      },
      true,
    );
    const reading = collected(link.frames(0, nothing()));
    await tick();

    expect(sockets[0].protocols[1]).toBe("fresh");
    sockets[0].onclose?.();
    await reading;
  });

  it("yields the frames it is sent, and fails as opened when the socket then closes", async () => {
    const sockets: FakeSocket[] = [];
    const reading = collected(linkWith(sockets).frames(1, nothing()));
    await tick();
    sockets[0].onopen?.();
    sockets[0].receive({ seq: 2, prev: 1, kind: "text", text: "Fort" });
    sockets[0].receive({ seq: 3, prev: 2, kind: "text", text: "y" });
    sockets[0].onclose?.();

    const { got, failure } = await reading;

    expect(got.map((frame) => ("text" in frame ? frame.text : ""))).toEqual([
      "Fort",
      "y",
    ]);
    expect(failure).toBeInstanceOf(LinkFailed);
    expect((failure as LinkFailed).opened).toBe(true);
    expect(sockets[0].closed).toBe(true);
  });

  it("fails as not opened when the socket never opens", async () => {
    const sockets: FakeSocket[] = [];
    const reading = collected(linkWith(sockets).frames(1, nothing()));
    await tick();
    sockets[0].onerror?.();

    const { failure } = await reading;

    expect((failure as LinkFailed).opened).toBe(false);
  });

  it("drops what is not a frame, and the pong", async () => {
    const sockets: FakeSocket[] = [];
    const reading = collected(linkWith(sockets).frames(1, nothing()));
    await tick();
    sockets[0].onopen?.();
    sockets[0].receive("pong");
    sockets[0].receive("{not json");
    sockets[0].receive({ seq: 2, prev: 1, kind: "mystery" });
    sockets[0].receive({ seq: 2, prev: 1, kind: "text", text: "Yes" });
    sockets[0].onclose?.();

    const { got } = await reading;

    expect(got).toHaveLength(1);
  });

  it("ends without failing when the page leaves", async () => {
    const sockets: FakeSocket[] = [];
    const leave = new AbortController();
    const reading = collected(linkWith(sockets).frames(1, leave.signal));
    await tick();
    sockets[0].onopen?.();
    leave.abort();

    const { failure } = await reading;

    expect(failure).toBeUndefined();
    expect(sockets[0].closed).toBe(true);
  });

  describe("heartbeat", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("sends ping while open and fails when nothing is heard for too long", async () => {
      const sockets: FakeSocket[] = [];
      let clock = 0;
      const reading = collected(
        linkWith(sockets, () => clock).frames(1, nothing()),
      );
      await vi.advanceTimersByTimeAsync(0);
      sockets[0].onopen?.();

      clock = 15_000;
      await vi.advanceTimersByTimeAsync(15_000);
      expect(sockets[0].sent).toEqual(["ping"]);
      sockets[0].receive("pong");

      clock = 60_000;
      await vi.advanceTimersByTimeAsync(45_000);
      const { failure } = await reading;

      expect((failure as LinkFailed).message).toMatch(/silent/);
      expect((failure as LinkFailed).opened).toBe(true);
    });

    it("fails as not opened when the socket does not open in time", async () => {
      const sockets: FakeSocket[] = [];
      let clock = 0;
      const reading = collected(
        linkWith(sockets, () => clock).frames(1, nothing()),
      );
      await vi.advanceTimersByTimeAsync(0);

      clock = 16_000;
      await vi.advanceTimersByTimeAsync(15_000);
      const { failure } = await reading;

      expect((failure as LinkFailed).opened).toBe(false);
    });
  });
});

function streamOf(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

describe("eventsLink", () => {
  it("asks from the cursor and reads the frames across chunks", async () => {
    fetchWithSession.mockResolvedValueOnce(
      streamOf([
        ': open\n\nid: 2\ndata: {"seq":2,"prev":1,"kind":"te',
        'xt","text":"Fort"}\n\nid: 3\ndata: {"seq":3,"prev":2,"kind":"text","text":"y"}\n\n',
      ]),
    );
    const opened = vi.fn();

    const { got, failure } = await collected(
      eventsLink(CHAT, TURN).frames(1, nothing(), opened),
    );

    expect(failure).toBeUndefined();
    expect(got.map((frame) => ("text" in frame ? frame.text : ""))).toEqual([
      "Fort",
      "y",
    ]);
    expect(opened).toHaveBeenCalledOnce();
    const [url, init] = fetchWithSession.mock.calls[0];
    expect(url).toBe(`https://api.test/api/chats/${CHAT}/turns/${TURN}/events`);
    expect(init.headers).toMatchObject({ "Last-Event-ID": "1" });
  });

  it("reads a reset", async () => {
    fetchWithSession.mockResolvedValueOnce(
      streamOf(['data: {"kind":"reset"}\n\n']),
    );

    const { got } = await collected(
      eventsLink(CHAT, TURN).frames(99, nothing()),
    );

    expect(got).toEqual([{ kind: "reset" }]);
  });

  it("fails as not opened when the server is busy or unreachable", async () => {
    fetchWithSession.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    fetchWithSession.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const busy = await collected(eventsLink(CHAT, TURN).frames(1, nothing()));
    const offline = await collected(
      eventsLink(CHAT, TURN).frames(1, nothing()),
    );

    expect((busy.failure as LinkFailed).opened).toBe(false);
    expect((offline.failure as LinkFailed).opened).toBe(false);
  });

  it("does not hide a chat that is not found behind a retry", async () => {
    fetchWithSession.mockResolvedValueOnce(
      Response.json({ detail: { code: "chat_not_found" } }, { status: 404 }),
    );

    const { failure } = await collected(
      eventsLink(CHAT, TURN).frames(1, nothing()),
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(404);
  });

  it("fails as opened when the stream breaks after it began", async () => {
    const broken = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(": open\n\n"));
          controller.error(new TypeError("network error"));
        },
      }),
    );
    fetchWithSession.mockResolvedValueOnce(broken);

    const { failure } = await collected(
      eventsLink(CHAT, TURN).frames(1, nothing()),
    );

    expect((failure as LinkFailed).opened).toBe(true);
  });
});
