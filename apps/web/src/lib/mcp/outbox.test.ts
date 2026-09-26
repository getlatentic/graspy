import { ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/client";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotForViews } from "./refusal";

const callAppTool = vi.fn();
vi.mock("./server", () => ({ callAppTool }));

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
});

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

  it("is not kept when the server refuses it, and a kept one it refuses is dropped", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const refused = new NotForViews("give_practice");
    callAppTool.mockRejectedValue(refused);
    const { callOrKeep, sendKept } = await fresh();

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

/** One answer_check kept while offline, and the device back online. The errors come from the
 * outbox's own module graph, as the session's do. */
async function keptOffline() {
  online = false;
  callAppTool.mockReset().mockRejectedValue(new TypeError("Failed to fetch"));
  const outbox = await fresh();
  const errors: Errors = await import("@/lib/api/errors");
  await outbox.callOrKeep("answer_check", ANSWER);
  online = true;
  return { ...outbox, errors };
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
