import { afterEach, describe, expect, it, vi } from "vitest";
import { callJson, callTool } from "../src/bedrock-chat";

const env = { AWS_BEARER_TOKEN_BEDROCK: "test" } as unknown as Env;
const request = { model: "google.gemma-4-26b-a4b", system: "s", user: "u", timeoutMs: 500, maxTokens: 50, part: "test", hedgeAfterMs: 20 };
const reply = (message: object, status = 200) => new Response(JSON.stringify({ choices: [{ message }] }), { status });
const json = (body: object) => reply({ content: JSON.stringify(body) });
/** A request that never answers, and fails when it is given up on. */
const hangs = (_url: unknown, init?: { signal?: AbortSignal }) =>
  new Promise<Response>((_, reject) => {
    if (init?.signal?.aborted) reject(new Error("aborted"));
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  });

afterEach(() => vi.unstubAllGlobals());

describe("a model call is hedged against the host's slow ones", () => {
  it("sends one request when the first answers in time", async () => {
    const fetcher = vi.fn(async () => json({ ok: 1 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await callJson(env, { ...request, schema: {}, name: "x" })).toEqual({ ok: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sends a second when the first has not answered, and takes it, and gives the first up", async () => {
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn((url: unknown, init?: { signal?: AbortSignal }) => {
      signals.push(init!.signal!);
      return signals.length === 1 ? hangs(url, init) : Promise.resolve(json({ ok: 2 }));
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await callJson(env, { ...request, schema: {}, name: "x" })).toEqual({ ok: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(signals[0].aborted).toBe(true);
  });

  it("sends the second at once where the first fails at once, and is null where both do", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (calls++ === 0 ? reply({}, 500) : json({ ok: 3 }))));
    const started = Date.now();
    expect(await callJson(env, { ...request, hedgeAfterMs: 400, schema: {}, name: "x" })).toEqual({ ok: 3 });
    expect(Date.now() - started).toBeLessThan(300);
    expect(calls).toBe(2);
    vi.stubGlobal("fetch", vi.fn(async () => reply({}, 500)));
    expect(await callJson(env, { ...request, hedgeAfterMs: 5, schema: {}, name: "x" })).toBeNull();
  });

  it("is null at the time given even where the hedge was set later than that", async () => {
    vi.stubGlobal("fetch", vi.fn(hangs));
    const started = Date.now();
    expect(await callTool(env, { ...request, timeoutMs: 60, hedgeAfterMs: 5000, tools: [] })).toBeNull();
    expect(Date.now() - started).toBeLessThan(400);
  });

  it("is null where neither answers within the time given", async () => {
    vi.stubGlobal("fetch", vi.fn(hangs));
    expect(await callTool(env, { ...request, timeoutMs: 80, tools: [] })).toBeNull();
  });

  it("sends nothing where there is no key", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await callTool({} as Env, { ...request, tools: [] })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
