import { afterEach, describe, expect, it, vi } from "vitest";
import { CLEF_MODEL } from "../src/interpret";
import { JUDGE_MODEL, SAFETY_MODEL } from "../src/guard";
import { NEEDS_HELP, NOT_HEARD } from "../src/phrasebook";
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
  const others = ["mark_answer", "ask_again", "not_know", "repeat_question", "needs_help", "answer_child"].filter((name) => name !== action);
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
    expect([reply.verdict, reply.heard, reply.say]).toEqual(["unheard", "conversation", "One heap has five oranges. How many oranges are in two heaps?"]);
  });

  it("whose words are garbled, and more than a word or two, is asked again from the phrasebook", async () => {
    const { env } = setup({ clef: sure("ask_again") });
    const reply = await takeTurn(env, ask("my chain saw hot sink to me"));
    expect([reply.verdict, reply.heard]).toEqual(["unheard", "garbled"]);
    expect(NOT_HEARD).toContain(reply.say);
  });

  it("who needs the toilet is let go in the teacher's own words, with no condition and no model-written line", async () => {
    const { env, bedrock } = setup({ clef: sure("needs_help") });
    const reply = await takeTurn(env, ask("I want to use the toilet please"));
    expect([reply.verdict, reply.heard]).toEqual(["unheard", "conversation"]);
    expect(NEEDS_HELP).toContain(reply.say);
    expect(bedrock).not.toHaveBeenCalled();
  });

  it("who needs the toilet in a word or two is let go too, since that cannot lose a right answer", async () => {
    const { env } = setup({ clef: sure("needs_help") });
    expect(NEEDS_HELP).toContain((await takeTurn(env, ask("toilet please"))).say);
  });

  it("who says something else is answered by the language model in one kind line, once the checks pass", async () => {
    const { env, asked } = setup({ clef: sure("answer_child"), tool: { name: "answer_child", args: { reply: "Yes, we can go soon. How many oranges in two heaps?" } } });
    const reply = await takeTurn(env, ask("Can I go to the toilet?"));
    expect([reply.verdict, reply.heard, reply.say]).toEqual(["unheard", "conversation", "Yes, we can go soon. How many oranges in two heaps?"]);
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

  it("takes Clef's choice at the threshold and not below it", async () => {
    const at = (p: number) => ({ not_know: p, mark_answer: (1 - p) / 4, ask_again: (1 - p) / 4, repeat_question: (1 - p) / 4, answer_child: (1 - p) / 4 });
    const above = setup({ clef: at(ROUTE_MIN), tool: { name: "not_know" } });
    await takeTurn(above.env, ask("I no sabi", ["Think of two heaps."]));
    expect(above.bedrock).not.toHaveBeenCalled();
    const below = setup({ clef: at(ROUTE_MIN - 0.01), tool: { name: "not_know" } });
    await takeTurn(below.env, ask("I no sabi", ["Think of two heaps."]));
    expect(below.bedrock).toHaveBeenCalledTimes(1);
  });
});

describe("what the review found the router must not do", () => {
  const stayed = async (script: Script, turn: Ask) => {
    const { env, asked, bedrock } = setup(script);
    await takeTurn(env, turn).catch(() => undefined);
    return { asked, bedrock };
  };

  it("does not route a question whose answer is a word, such as a shape or a letter", async () => {
    const { asked } = await stayed({ clef: sure("ask_again") }, { ...ask("Circle."), expect: { kind: "fact", item: "circle" } });
    expect(asked).not.toContain(CLEF_MODEL);
  });

  it("does not route when there is no question to answer", async () => {
    const { asked } = await stayed({ clef: sure("repeat_question") }, { ...ask("what"), prompt: "  " });
    expect(asked).not.toContain(CLEF_MODEL);
  });

  it("leaves a word or two that is called garbled or something else to the marking, which can read a sound-alike", async () => {
    for (const action of ["ask_again", "answer_child", "mark_answer"]) {
      const { env } = setup({ clef: sure(action), tool: { name: action, args: { reply: "Good try. How many?" } } });
      await expect(takeTurn(env, ask("tin")), action).rejects.toThrow("the teacher was asked");
    }
  });

  it("does not give a child the answer in a kind reply", async () => {
    for (const reply of ["It is ten, say ten.", "The answer is 10.", "Five and five make ten, my dear."]) {
      const { env } = setup({ clef: sure("answer_child"), tool: { name: "answer_child", args: { reply } } });
      await expect(takeTurn(env, ask("What is the answer?")), reply).rejects.toThrow("the teacher was asked");
    }
  });

  it("is not fooled by a tool name that is a property of every object", async () => {
    const { env } = setup({ clef: sure("answer_child"), tool: { name: "constructor" } });
    await expect(takeTurn(env, ask("Can I go to the toilet?"))).rejects.toThrow("the teacher was asked");
  });

  it("asks the language model with the key, the tools and no answer, and leaves a refusal to the usual marking", async () => {
    const { env, bedrock } = setup({ clef: sure("answer_child"), tool: { name: "answer_child", args: { reply: "Yes, soon. How many oranges?" } } });
    await takeTurn(env, ask("Can I go to the toilet?"));
    const [url, init] = bedrock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    const sent = JSON.parse(init.body);
    expect(url).toContain("bedrock-mantle.us-east-1.api.aws/openai/v1/chat/completions");
    expect(init.headers.authorization).toBe("Bearer test");
    expect(sent.tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual(["mark_answer", "ask_again", "not_know", "repeat_question", "needs_help", "answer_child"]);
    expect(JSON.stringify(sent.messages)).not.toMatch(/"10"|\bten\b/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    await expect(takeTurn(env, ask("Can I go to the toilet?"))).rejects.toThrow("the teacher was asked");
  });
});
