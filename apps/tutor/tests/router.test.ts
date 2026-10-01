import { afterEach, describe, expect, it, vi } from "vitest";
import { CLEF_MODEL } from "../src/interpret";
import { JUDGE_MODEL, SAFETY_MODEL } from "../src/guard";
import { NOT_HEARD } from "../src/phrasebook";
import { READER_MODEL } from "../src/read";
import { ROUTE_MIN, holdsANumber } from "../src/router";
import { takeTurn, type Ask } from "../src/turn";

interface Script {
  /** Clef's probabilities for each action. */
  clef?: Record<string, number>;
  clefFails?: boolean;
  /** What the language model chooses: a tool and its arguments, or nothing. */
  tool?: { name: string; args?: Record<string, unknown> } | null;
  safe?: boolean;
  fit?: boolean;
}

function setup(script: Script, router = "on") {
  const asked: string[] = [];
  const bedrock = vi.fn(async () => {
    const call = script.tool ? { function: { name: script.tool.name, arguments: JSON.stringify(script.tool.args ?? {}) } } : null;
    return new Response(JSON.stringify({ choices: [{ message: { tool_calls: call ? [call] : [] } }] }), { status: 200 });
  });
  vi.stubGlobal("fetch", bedrock);
  const env = {
    ROUTER: router,
    AWS_BEARER_TOKEN_BEDROCK: "test",
    AI: {
      run: async (model: string, input?: { response_format?: unknown }) => {
        asked.push(model);
        if (model === CLEF_MODEL) {
          if (script.clefFails) throw new Error("5006");
          return { answers: { action: { probabilities: script.clef } } };
        }
        if (model === SAFETY_MODEL) return { response: script.safe === false ? "unsafe" : "safe" };
        if (model === JUDGE_MODEL && input?.response_format) return { choices: [{ message: { content: JSON.stringify({ fit: script.fit !== false, reason: "test" }) } }] };
        if (model === READER_MODEL) return { choices: [{ message: { content: JSON.stringify({ answer: null }) } }] };
        throw new Error(`the teacher was asked (${model})`);
      },
    },
  } as unknown as Env;
  return { env, asked, bedrock };
}

afterEach(() => vi.unstubAllGlobals());

const sure = (action: string): Record<string, number> => {
  const others = ["mark_answer", "ask_again", "not_know", "repeat_question", "answer_child"].filter((name) => name !== action);
  return { ...Object.fromEntries(others.map((name) => [name, 0.025])), [action]: 0.9 };
};
const ask = (heard: string, hints?: string[]): Ask => ({
  prompt: "One heap has five oranges. How many oranges are in two heaps?",
  heard,
  language: "en",
  expect: { kind: "fact", item: "10", ...(hints ? { hints } : {}) },
});

describe("a child who is not giving a number", () => {
  it("who says they do not know in Pidgin is met with the next hint, as a try", async () => {
    const { env, bedrock } = setup({ clef: sure("not_know") });
    const reply = await takeTurn(env, ask("I no sabi", ["Think of two heaps."]));
    expect([reply.verdict, reply.heard, reply.say]).toEqual(["unheard", "dont_know", "Think of two heaps."]);
    expect(bedrock).not.toHaveBeenCalled();
  });

  it("who asks for the question again hears it again, and it is no try", async () => {
    const { env } = setup({ clef: sure("repeat_question") });
    const reply = await takeTurn(env, ask("Say am again"));
    expect([reply.verdict, reply.heard, reply.say]).toEqual(["unheard", "nothing", "One heap has five oranges. How many oranges are in two heaps?"]);
  });

  it("whose words are garbled is asked again from the phrasebook", async () => {
    const { env } = setup({ clef: sure("ask_again") });
    const reply = await takeTurn(env, ask("Chainsaw"));
    expect([reply.verdict, reply.heard]).toEqual(["unheard", "garbled"]);
    expect(NOT_HEARD).toContain(reply.say);
  });

  it("who says something else is answered by the language model in one kind line, once the checks pass", async () => {
    const { env, asked } = setup({ clef: sure("answer_child"), tool: { name: "answer_child", args: { reply: "Yes, we can go soon. How many oranges in two heaps?" } } });
    const reply = await takeTurn(env, ask("Can I go to the toilet?"));
    expect([reply.verdict, reply.say]).toEqual(["unheard", "Yes, we can go soon. How many oranges in two heaps?"]);
    expect(asked).toContain(SAFETY_MODEL);
  });

  it("is not answered with a line the checks refuse, and goes on as before", async () => {
    const { env } = setup({ clef: sure("answer_child"), tool: { name: "answer_child", args: { reply: "Tell me where you live." } }, fit: false });
    await expect(takeTurn(env, ask("Can I go to the toilet?"))).rejects.toThrow("the teacher was asked");
  });

  it("is routed by the language model when Clef is not sure, and a number is never taken from it", async () => {
    const { env, bedrock } = setup({ clef: { mark_answer: 0.4, ask_again: 0.3, not_know: 0.1, repeat_question: 0.1, answer_child: 0.1 }, tool: { name: "mark_answer", args: { said: 20 } } });
    await expect(takeTurn(env, ask("To recent."))).rejects.toThrow("the teacher was asked");
    expect(bedrock).toHaveBeenCalledTimes(1);
  });
});

describe("where the router stays out of the way", () => {
  it("is not asked when it is off", async () => {
    const { env, asked } = setup({ clef: sure("not_know") }, "");
    await expect(takeTurn(env, ask("I no sabi"))).rejects.toThrow("the teacher was asked");
    expect(asked).not.toContain(CLEF_MODEL);
  });

  it("is not asked about words that hold a number, or a sound-alike the table reads", async () => {
    for (const heard of ["it is ten", "10", "Nein.", "to"]) {
      const { env, asked } = setup({ clef: sure("answer_child") });
      await takeTurn(env, ask(heard)).catch(() => undefined);
      expect(asked, heard).not.toContain(CLEF_MODEL);
    }
    expect(holdsANumber("five and five")).toBe(true);
    expect(holdsANumber("I want football")).toBe(false);
  });

  it("is not asked in another language, or for a list", async () => {
    const yoruba = setup({ clef: sure("not_know") });
    await takeTurn(yoruba.env, { ...ask("Mi ò mọ̀"), language: "yo" }).catch(() => undefined);
    expect(yoruba.asked).not.toContain(CLEF_MODEL);
  });

  it("goes on to the usual marking when neither Clef nor the model can say", async () => {
    const { env } = setup({ clefFails: true, tool: null });
    await expect(takeTurn(env, ask("Chainsaw"))).rejects.toThrow("the teacher was asked");
  });

  it("takes Clef's choice only at the threshold", () => {
    expect(ROUTE_MIN).toBeGreaterThan(0.5);
  });
});
