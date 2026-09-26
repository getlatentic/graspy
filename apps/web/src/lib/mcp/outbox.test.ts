import {
  ProtocolError,
  ProtocolErrorCode,
  SdkErrorCode,
  SdkHttpError,
} from "@modelcontextprotocol/client";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callAppTool = vi.fn();
const reachServer = vi.fn();
vi.mock("./server", () => ({ callAppTool, reachServer }));

const ANSWER = { question: "3/8?", options: ["0.375", "0.38"], chosenIndex: 1 };
const FINISH = { planId: "plan-1", topic: "Fractions" };
const DONE = { content: [{ type: "text", text: "done" }] };

let online = true;

async function fresh() {
  vi.resetModules();
  return import("./outbox");
}

beforeEach(() => {
  online = true;
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  vi.stubGlobal("navigator", {
    get onLine() {
      return online;
    },
  });
  callAppTool.mockReset();
  reachServer.mockReset().mockResolvedValue(undefined);
});

// As the SDK throws a non-OK answer to a POST it did not read as JSON-RPC, with its body.
const httpError = (status: number, text = "") =>
  new SdkHttpError(
    SdkErrorCode.ClientHttpNotImplemented,
    `Error POSTing to endpoint: ${text}`,
    { status, text },
  );
// As graspy's /mcp refuses a request, whatever the status.
const refusedByGraspy = (status: number, message: string) =>
  httpError(
    status,
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message },
    }),
  );

afterEach(() => vi.unstubAllGlobals());

describe("a view's call", () => {
  it("runs on the server while it can be reached", async () => {
    callAppTool.mockResolvedValue(DONE);
    const { callOrKeep, sendKept } = await fresh();

    await expect(callOrKeep("answer_check", ANSWER)).resolves.toBe(DONE);
    expect(await sendKept()).toBe(0);
  });

  it("is kept offline, the view told so, and sent in order once back", async () => {
    online = false;
    callAppTool.mockRejectedValue(new TypeError("Failed to fetch"));
    const { callOrKeep, sendKept } = await fresh();

    await expect(callOrKeep("answer_check", ANSWER)).resolves.toMatchObject({
      content: [{ type: "text" }],
    });
    await callOrKeep("finish_lesson", FINISH);

    online = true;
    callAppTool.mockReset().mockResolvedValue(DONE);
    expect(await sendKept()).toBe(2);
    expect(callAppTool.mock.calls).toEqual([
      ["answer_check", ANSWER],
      ["finish_lesson", FINISH],
    ]);
    expect(await sendKept()).toBe(0);
  });

  it("stays kept while the server still cannot be reached", async () => {
    online = false;
    callAppTool.mockRejectedValue(new TypeError("Failed to fetch"));
    const { callOrKeep, sendKept } = await fresh();
    await callOrKeep("answer_check", ANSWER);

    expect(await sendKept()).toBe(0);
    online = true;
    callAppTool.mockReset().mockResolvedValue(DONE);
    expect(await sendKept()).toBe(1);
  });

  it.each([
    ["fails on its side", () => httpError(503)],
    ["is rate limited", () => httpError(429)],
    ["refuses the session", () => httpError(401)],
  ])("is kept, the view told so, when the server %s", async (_, failure) => {
    callAppTool.mockRejectedValue(failure());
    const { callOrKeep, sentEverything } = await fresh();

    await expect(callOrKeep("answer_check", ANSWER)).resolves.toEqual({
      content: [
        { type: "text", text: "This is kept on the device and sent later." },
      ],
    });
    callAppTool.mockReset().mockResolvedValue(DONE);
    expect(await sentEverything()).toBe(true);
    expect(callAppTool).toHaveBeenCalledWith("answer_check", ANSWER);
  });

  it("is kept when connecting is refused, whatever the status", async () => {
    const refused = refusedByGraspy(400, "Unsupported protocol version");
    reachServer.mockRejectedValue(refused);
    callAppTool.mockRejectedValue(refused);
    const { callOrKeep, sentEverything } = await fresh();

    await expect(callOrKeep("answer_check", ANSWER)).resolves.toMatchObject({
      content: [{ type: "text" }],
    });
    reachServer.mockResolvedValue(undefined);
    callAppTool.mockReset().mockResolvedValue(DONE);
    expect(await sentEverything()).toBe(true);
    expect(callAppTool).toHaveBeenCalledWith("answer_check", ANSWER);
  });

  it("is not kept when the server refuses it, and a kept one it refuses is dropped", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { callOrKeep, sendKept } = await fresh();
    const { NotForViews }: Refusal = await import("./refusal");
    const refused = new NotForViews("give_practice");
    callAppTool.mockRejectedValue(refused);

    await expect(callOrKeep("give_practice", {})).rejects.toBe(refused);

    await keptOffline();
    callAppTool
      .mockReset()
      .mockRejectedValue(
        new ProtocolError(ProtocolErrorCode.InvalidParams, "Invalid arguments"),
      );
    expect(await sendKept()).toBe(1);
    expect(await sendKept()).toBe(0);
  });

  it.each([
    [
      "no longer offered to views",
      (refusal: Refusal) => new refusal.NotForViews("answer_check"),
    ],
    [
      "given invalid params",
      () =>
        new ProtocolError(ProtocolErrorCode.InvalidParams, "Invalid arguments"),
    ],
    [
      "too large for the server",
      () => refusedByGraspy(413, "Request too large"),
    ],
    ["answered 400 over HTTP", () => refusedByGraspy(400, "Parse error")],
  ])(
    "kept, is dropped when the server refuses it as %s",
    async (_, refusal) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const outbox = await keptOffline();
      callAppTool.mockReset().mockRejectedValue(refusal(outbox.refusal));

      const { sendKept, sentEverything } = outbox;

      expect(await sendKept()).toBe(1);
      expect(await sentEverything()).toBe(true);
    },
  );

  it.each([
    ["a proxy's 404 page", () => httpError(404, "<html>Not found</html>")],
    ["a CDN's 451", () => httpError(451, "Unavailable")],
    ["a 410 with no body", () => httpError(410)],
    [
      "a route missing mid-deploy",
      () => httpError(404, JSON.stringify({ detail: "Not Found" })),
    ],
  ])("stays kept on a 4xx graspy did not give: %s", async (_, answer) => {
    const outbox = await keptOffline();
    callAppTool.mockReset().mockRejectedValue(answer());

    expect(await outbox.sendKept()).toBe(0);
    expect(await outbox.sentEverything()).toBe(false);
  });

  it("stays kept when the server cannot be connected to, whatever the status", async () => {
    const { sendKept } = await keptOffline();
    const refused = httpError(404);
    reachServer.mockRejectedValue(refused);
    callAppTool.mockReset().mockRejectedValue(refused);

    expect(await sendKept()).toBe(0);
    reachServer.mockResolvedValue(undefined);
    callAppTool.mockReset().mockResolvedValue(DONE);
    expect(await sendKept()).toBe(1);
  });

  it.each([
    ["the MCP endpoint answers 500", () => httpError(500)],
    ["the MCP endpoint is rate limited", () => httpError(429)],
    ["the MCP endpoint times out the request", () => httpError(408)],
    ["the session is refused over HTTP", () => httpError(401)],
    ["the learner is forbidden over HTTP", () => httpError(403)],
    [
      "the session is rate limited",
      (api: Errors) =>
        new api.ApiError("Too many requests", 429, {
          error: "Too many requests",
          code: "rate_limited",
        }),
    ],
    [
      "Firebase is asked too often",
      (api: Errors) => new api.SignInUnchecked("auth/too-many-requests", 429),
    ],
    [
      "Firebase fails on its side",
      (api: Errors) => new api.SignInUnchecked("auth/internal-error", 503),
    ],
    [
      "the session exchange meets a bad gateway",
      (api: Errors) => new api.ApiError("Bad gateway", 502),
    ],
    [
      "the MCP endpoint fails",
      () => new Error("Error POSTing to endpoint (HTTP 500): boom"),
    ],
    [
      "the server fails the call",
      () =>
        new ProtocolError(ProtocolErrorCode.InternalError, "Internal error"),
    ],
  ])(
    "stays kept, and blocks letting the learner go, when %s",
    async (_, failure) => {
      const { sendKept, sentEverything, errors } = await keptOffline();
      callAppTool.mockReset().mockRejectedValue(failure(errors));

      expect(await sendKept()).toBe(0);
      expect(await sentEverything()).toBe(false);
      callAppTool.mockReset().mockResolvedValue(DONE);
      expect(await sendKept()).toBe(1);
    },
  );
});

type Errors = typeof import("@/lib/api/errors");
type Refusal = typeof import("./refusal");

/** One answer_check kept while offline, and the device back online. The errors come from the
 * outbox's own module graph, as the session's and the server's do. */
async function keptOffline() {
  online = false;
  callAppTool.mockReset().mockRejectedValue(new TypeError("Failed to fetch"));
  const outbox = await fresh();
  const errors: Errors = await import("@/lib/api/errors");
  const refusal: Refusal = await import("./refusal");
  await outbox.callOrKeep("answer_check", ANSWER);
  online = true;
  return { ...outbox, errors, refusal };
}

describe("sentEverything", () => {
  it("is false while a kept call cannot reach the server, and true once sent", async () => {
    online = false;
    callAppTool.mockRejectedValue(new TypeError("Failed to fetch"));
    const { callOrKeep, sentEverything } = await fresh();
    await callOrKeep("answer_check", ANSWER);

    expect(await sentEverything()).toBe(false);
    online = true;
    callAppTool.mockReset().mockResolvedValue(DONE);
    expect(await sentEverything()).toBe(true);
  });
});
