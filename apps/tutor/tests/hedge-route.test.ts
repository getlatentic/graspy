import { afterEach, describe, expect, it, vi } from "vitest";
import { JUDGE_MODEL, SAFETY_MODEL } from "../src/guard";
import { READER_MODEL } from "../src/read";
import { takeTurn, type Ask } from "../src/turn";

const QUESTION = "One heap has five oranges. How many oranges are in two heaps?";
const ask = (heard: string): Ask => ({ prompt: QUESTION, heard, language: "en", expect: { kind: "fact", item: "10" } });

interface Model {
  /** Milliseconds each request takes, by its number among the router's (or the observer's); a negative number never answers. */
  delays: number[];
  say: { tool: { name: string; args?: object } } | { json: object };
}

/** One Bedrock: the router's requests (with tools) and the observer's (without) are told apart and counted. */
function setup(router: Model, observer: Model, flags: Record<string, string> = { OBSERVER_HEDGE: "on" }) {
  const calls = { router: 0, observer: 0 };
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: { body: string; signal?: AbortSignal }) => {
    const asked = JSON.parse(init.body);
    const kind = asked.tools ? "router" : "observer";
    const model = kind === "router" ? router : observer;
    const delay = model.delays[calls[kind]++] ?? 0;
    if (delay < 0) await new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    else await new Promise((resolve) => setTimeout(resolve, delay));
    const message = "tool" in model.say
      ? { tool_calls: [{ function: { name: model.say.tool.name, arguments: JSON.stringify(model.say.tool.args ?? {}) } }] }
      : { content: JSON.stringify(model.say.json) };
    return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
  }));
  const env = {
    ROUTER: "on",
    ...flags,
    AWS_BEARER_TOKEN_BEDROCK: "test",
    AI: {
      run: async (model: string, input?: { response_format?: unknown }) => {
        if (model === SAFETY_MODEL) return { response: "safe" };
        if (model === JUDGE_MODEL && input?.response_format) return { choices: [{ message: { content: JSON.stringify({ fit: true, reason: "test" }) } }] };
        if (model === READER_MODEL) return { choices: [{ message: { content: JSON.stringify({ answer: null }) } }] };
        throw new Error(`the teacher was asked (${model})`);
      },
    },
  } as unknown as Env;
  return { env, calls };
}

const logged = () => vi.spyOn(console, "log").mockImplementation(() => undefined);
const lines = (spy: ReturnType<typeof logged>) => spy.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);

const ROUTER_SAYS_TEN = { tool: { name: "mark_answer", args: { said: 10 } } };
const OBSERVER_SAYS_TOILET = { json: { physical_need: { toilet: 0.9 } } };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the observer beside the router's second request", () => {
  it("answers from the observer when the router is slow, and does not wait the router out", async () => {
    const spy = logged();
    const { env, calls } = setup({ delays: [-1, -1], say: ROUTER_SAYS_TEN }, { delays: [50], say: OBSERVER_SAYS_TOILET });
    const started = Date.now();
    const reply = await takeTurn(env, ask("I must go behind the house"));
    expect(Date.now() - started).toBeLessThan(2000);
    expect(reply.verdict).toBe("unheard");
    expect(reply.heard).toBe("conversation");
    expect(calls).toEqual({ router: 2, observer: 1 });
    const hedge = lines(spy).find((line) => line.part === "route-hedge");
    expect([hedge?.by, hedge?.action]).toEqual(["observer", "needs_help"]);
  });

  it("takes the router's answer where it comes first after the second request", async () => {
    const spy = logged();
    const { env } = setup({ delays: [-1, 30], say: ROUTER_SAYS_TEN }, { delays: [900], say: OBSERVER_SAYS_TOILET });
    expect((await takeTurn(env, ask("Then"))).verdict).toBe("correct");
    expect(lines(spy).find((line) => line.part === "route-hedge")?.by).toBe("router");
  });

  it("waits for the router where the observer's policy settles nothing", async () => {
    const { env } = setup({ delays: [-1, 300], say: ROUTER_SAYS_TEN }, { delays: [10], say: { json: {} } });
    expect((await takeTurn(env, ask("Then"))).verdict).toBe("correct");
  });

  it("does not call the observer where the router answers in time", async () => {
    const spy = logged();
    const { env, calls } = setup({ delays: [10], say: ROUTER_SAYS_TEN }, { delays: [10], say: OBSERVER_SAYS_TOILET });
    expect((await takeTurn(env, ask("Then"))).verdict).toBe("correct");
    expect(calls).toEqual({ router: 1, observer: 0 });
    expect(lines(spy).some((line) => line.part === "route-hedge")).toBe(false);
  });

  it("starts the observer at once where the router has no usable answer", async () => {
    const { env, calls } = setup({ delays: [0, 0], say: { tool: { name: "no_such_tool" } } }, { delays: [10], say: OBSERVER_SAYS_TOILET });
    expect((await takeTurn(env, ask("I must go behind the house"))).heard).toBe("conversation");
    expect(calls.observer).toBe(1);
  });

  it("never writes the child's words in the log", async () => {
    const spy = logged();
    const { env } = setup({ delays: [-1, -1], say: ROUTER_SAYS_TEN }, { delays: [10], say: OBSERVER_SAYS_TOILET });
    await takeTurn(env, ask("I must go behind the house"));
    expect(JSON.stringify(lines(spy))).not.toMatch(/behind the house/);
  });

  it("leaves the router alone where the hedge is off", async () => {
    const { env, calls } = setup({ delays: [-1, 20], say: ROUTER_SAYS_TEN }, { delays: [10], say: OBSERVER_SAYS_TOILET }, {});
    expect((await takeTurn(env, ask("Then"))).verdict).toBe("correct");
    expect(calls.observer).toBe(0);
  });

  it("shares the shadow's observation instead of asking twice", async () => {
    const { env, calls } = setup({ delays: [-1, -1], say: ROUTER_SAYS_TEN }, { delays: [30], say: OBSERVER_SAYS_TOILET }, { OBSERVER_HEDGE: "on", OBSERVER: "shadow" });
    expect((await takeTurn(env, ask("I must go behind the house"))).heard).toBe("conversation");
    expect(calls.observer).toBe(1);
  });
});
