import { describe, expect, it, vi } from "vitest";
import { runAi } from "../src/hedge";

const envWith = (run: (model: string, input: object) => Promise<unknown>) => ({ AI: { run } }) as unknown as Env;
const hangs = () => new Promise<never>(() => undefined);

describe("a Workers AI call is hedged against its slow ones", () => {
  it("sends one call when the first answers in time", async () => {
    const run = vi.fn(async () => ({ ok: 1 }));
    expect(await runAi(envWith(run), "m", { a: 1 }, { afterMs: 20, timeoutMs: 500 })).toEqual({ ok: 1 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("m", { a: 1 });
  });

  it("sends a second when the first has not answered, and takes whichever answers", async () => {
    let calls = 0;
    const run = vi.fn(() => (calls++ === 0 ? hangs() : Promise.resolve({ ok: 2 })));
    expect(await runAi(envWith(run), "m", {}, { afterMs: 20, timeoutMs: 500 })).toEqual({ ok: 2 });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("sends the second at once where the first fails at once, and is null where both do", async () => {
    let calls = 0;
    const started = Date.now();
    expect(await runAi(envWith(async () => { if (calls++ === 0) throw new Error("down"); return { ok: 3 }; }), "m", {}, { afterMs: 400, timeoutMs: 1000 })).toEqual({ ok: 3 });
    expect(Date.now() - started).toBeLessThan(300);
    expect(await runAi(envWith(async () => { throw new Error("down"); }), "m", {}, { afterMs: 5, timeoutMs: 100 })).toBeNull();
  });

  it("does not start the second where the deadline is spent, and says why it failed, without the child's words", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    let calls = 0;
    const env = envWith(async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 70)); throw new Error("quota"); });
    expect(await runAi(env, "m", { messages: "the child said football" }, { afterMs: 400, timeoutMs: 60, part: "reader-model-failed" })).toBeNull();
    expect(calls).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    log.mockRestore();
  });

  it("logs a failure under the part given and never the input", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runAi(envWith(async () => { throw new Error("quota exceeded"); }), "m", { messages: "the child said football" }, { afterMs: 5, timeoutMs: 100, part: "reader-model-failed" });
    const lines = log.mock.calls.map(([line]) => String(line));
    log.mockRestore();
    expect(lines.some((line) => line.includes("reader-model-failed") && line.includes("quota exceeded"))).toBe(true);
    expect(lines.some((line) => line.includes("football"))).toBe(false);
  });

  it("is null at the time given where neither answers", async () => {
    const started = Date.now();
    expect(await runAi(envWith(hangs), "m", {}, { afterMs: 20, timeoutMs: 80 })).toBeNull();
    expect(Date.now() - started).toBeLessThan(400);
  });
});

describe("what the callers make of a call that failed", () => {
  const failing = envWith(async () => { throw new Error("down"); });

  it("takes the safety model's failure for not safe, and the reader's for no number", async () => {
    const { safeForChild } = await import("../src/guard");
    const { answerHeard } = await import("../src/read");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await safeForChild(failing, "ten", "Well done.")).toBe(false);
    expect(await answerHeard(failing, "ten")).toBeNull();
    vi.restoreAllMocks();
  });
});
