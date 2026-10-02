import { afterEach, describe, expect, it, vi } from "vitest";
import { JUDGE_MODEL, SAFETY_MODEL } from "../src/guard";
import { READER_MODEL } from "../src/read";
import { timed, traced } from "../src/timing";
import { takeTurn, type Ask } from "../src/turn";

const QUESTION = "One heap has five oranges. How many oranges are in two heaps?";
const ask = (heard: string): Ask => ({ prompt: QUESTION, heard, language: "en", expect: { kind: "fact", item: "10" } });

/** One Bedrock: a tool call answers the router and a JSON object answers the observer, told apart by the request. */
function setup(router: { name: string; args?: object }, observation: object | null, flags: Record<string, string>) {
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: { body: string }) => {
    const wanted = JSON.parse(init.body);
    const message = wanted.tools
      ? { tool_calls: [{ function: { name: router.name, arguments: JSON.stringify(router.args ?? {}) } }] }
      : { content: observation === null ? "no" : JSON.stringify(observation) };
    return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
  }));
  return {
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
}

const logged = () => vi.spyOn(console, "log").mockImplementation(() => undefined);
const lines = (spy: ReturnType<typeof logged>) => spy.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the observer run beside the router and only logged", () => {
  it("leaves the router in charge of the turn and logs both, where they agree", async () => {
    const spy = logged();
    const env = setup({ name: "mark_answer", args: { said: 10 } }, { answer: { value: 10, confidence: 0.9 } }, { OBSERVER: "shadow" });
    expect((await takeTurn(env, ask("Then"))).verdict).toBe("correct");
    const shadow = lines(spy).find((line) => line.part === "observer-shadow");
    expect([shadow?.router, shadow?.observer, shadow?.agree]).toEqual(["mark_answer", "mark_answer", true]);
    expect(shadow?.heard).toBeUndefined();
  });

  it("logs where they differ, and the turn is still the router's", async () => {
    const spy = logged();
    const env = setup({ name: "mark_answer", args: { said: 10 } }, { answer: { value: 10, confidence: 0.9 }, safety: { illness: 0.9 } }, { OBSERVER: "shadow" });
    expect((await takeTurn(env, ask("Then"))).verdict).toBe("correct");
    const shadow = lines(spy).find((line) => line.part === "observer-shadow");
    expect([shadow?.router, shadow?.observer, shadow?.agree, shadow?.safety]).toEqual(["mark_answer", "needs_grownup", false, { illness: 0.9 }]);
  });

  it("logs that there was no observation where the model gave none", async () => {
    const spy = logged();
    const env = setup({ name: "mark_answer", args: { said: 10 } }, null, { OBSERVER: "shadow" });
    await takeTurn(env, ask("Then"));
    const shadow = lines(spy).find((line) => line.part === "observer-shadow");
    expect([shadow?.observer, shadow?.agree]).toEqual(["none", false]);
  });

  it("adds the child's words only where it is asked to", async () => {
    const spy = logged();
    const env = setup({ name: "mark_answer", args: { said: 10 } }, { answer: { value: 10, confidence: 0.9 } }, { OBSERVER: "shadow", OBSERVER_LOG_TEXT: "on" });
    await takeTurn(env, ask("Then"));
    expect(lines(spy).find((line) => line.part === "observer-shadow")?.heard).toBe("Then");
  });

  it("does not run where the observer is off or on", async () => {
    for (const flags of [{} as Record<string, string>, { OBSERVER: "on" }]) {
      const spy = logged();
      await takeTurn(setup({ name: "mark_answer", args: { said: 10 } }, { answer: { value: 10, confidence: 0.9 } }, flags), ask("Then"));
      expect(lines(spy).some((line) => line.part === "observer-shadow")).toBe(false);
    }
  });
});

describe("the parts of a turn are logged with the turn they were in", () => {
  it("names the turn by its last six characters, and not at all outside one", async () => {
    const spy = logged();
    await traced("sample-abcdef123456", () => timed("route", Promise.resolve(1)));
    await timed("read", Promise.resolve(1));
    const [inside, outside] = lines(spy);
    expect([inside.turn, inside.part]).toEqual(["123456", "route"]);
    expect("turn" in outside).toBe(false);
  });

  it("keeps two turns at the same time apart", async () => {
    const spy = logged();
    await Promise.all([
      traced("aaaaaa111111", async () => { await new Promise((resolve) => setTimeout(resolve, 5)); await timed("a", Promise.resolve(1)); }),
      traced("bbbbbb222222", () => timed("b", Promise.resolve(1))),
    ]);
    expect(Object.fromEntries(lines(spy).map((line) => [line.part, line.turn]))).toEqual({ a: "111111", b: "222222" });
  });
});
