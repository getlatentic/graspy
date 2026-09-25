import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    const refused = new Error("give_practice cannot be called from a view");
    callAppTool.mockRejectedValue(refused);
    const { callOrKeep, sendKept } = await fresh();

    await expect(callOrKeep("give_practice", {})).rejects.toBe(refused);

    online = false;
    callAppTool.mockReset().mockRejectedValue(new TypeError("Failed"));
    await callOrKeep("answer_check", ANSWER);
    online = true;
    callAppTool.mockReset().mockRejectedValue(new Error("Invalid arguments"));
    expect(await sendKept()).toBe(1);
    expect(await sendKept()).toBe(0);
  });
});

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
