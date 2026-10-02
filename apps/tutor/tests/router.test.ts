import { afterEach, describe, expect, it, vi } from "vitest";
import { JUDGE_MODEL, SAFETY_MODEL } from "../src/guard";
import { NEEDS_HELP, NOT_HEARD } from "../src/phrasebook";
import { READER_MODEL } from "../src/read";
import { takeTurn, type Ask } from "../src/turn";

interface Script {
  /** What the language model chooses: a tool and its arguments, or nothing. */
  tool?: { name: string; args?: Record<string, unknown> } | null;
  refuse?: boolean;
  safe?: boolean;
  fit?: boolean;
}

/** Bedrock answers from the script, Workers AI runs the checks and the small reader, and the teacher is never to be asked. */
function setup(script: Script, router = "on") {
  const asked: string[] = [];
  const bedrock = vi.fn(async () => {
    if (script.refuse) return new Response("no", { status: 500 });
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

const QUESTION = "One heap has five oranges. How many oranges are in two heaps?";
const ask = (heard: string, hints?: string[]): Ask => ({
  prompt: QUESTION,
  heard,
  language: "en",
  expect: { kind: "fact", item: "10", ...(hints ? { hints } : {}) },
});
const calls = async (tool: string, args: Record<string, unknown> | undefined, heard: string, hints?: string[]) => {
  const { env, bedrock } = setup({ tool: { name: tool, args } });
  return { reply: await takeTurn(env, ask(heard, hints)), bedrock };
};
const teacherAsked = async (script: Script, turn: Ask) => {
  const { env } = setup(script);
  await expect(takeTurn(env, turn)).rejects.toThrow("the teacher was asked");
};

describe("every utterance is read by one model that chooses an action", () => {
  it("meets a child who says they do not know in Pidgin with the next hint, as a try", async () => {
    const { reply, bedrock } = await calls("not_know", undefined, "I no sabi", ["Think of two heaps."]);
    expect([reply.verdict, reply.heard, reply.say]).toEqual(["unheard", "dont_know", "Think of two heaps."]);
    expect(bedrock).toHaveBeenCalledTimes(1);
  });

  it("answers a request to hear the question again with the question, and it is no try", async () => {
    const { reply } = await calls("repeat_question", undefined, "Say am again");
    expect([reply.verdict, reply.heard, reply.say]).toEqual(["unheard", "conversation", QUESTION]);
  });

  it("lets a child who needs the toilet go, in the teacher's own words and with no model-written line, even in a word or two", async () => {
    for (const heard of ["I want to use the toilet please", "toilet"]) {
      const { reply } = await calls("needs_help", undefined, heard);
      expect(reply.heard, heard).toBe("conversation");
      expect(NEEDS_HELP, heard).toContain(reply.say);
    }
  });

  it("lets a child who asks for the toilet go even when the model chose to reply to them", async () => {
    for (const action of ["answer_child", "ask_again"]) {
      const { reply } = await calls(action, { reply: "Please finish the question before you go." }, "Can I go to the toilet?");
      expect(NEEDS_HELP, action).toContain(reply.say);
    }
  });

  it("asks garbled words, of more than a few, again from the phrasebook", async () => {
    const { reply } = await calls("ask_again", undefined, "my chain saw hot sink to me");
    expect([reply.verdict, reply.heard]).toEqual(["unheard", "garbled"]);
    expect(NOT_HEARD).toContain(reply.say);
  });

  it("answers a child who says something else with one kind line, once the checks pass", async () => {
    const { reply } = await calls("answer_child", { reply: "Let's finish this question first." }, "I want to play football");
    expect([reply.verdict, reply.heard, reply.say]).toEqual(["unheard", "conversation", "Let's finish this question first."]);
  });

  it("is asked about a plain number too, and the number it reports is marked", async () => {
    const { reply, bedrock } = await calls("mark_answer", { said: 10 }, "10");
    expect(reply.verdict).toBe("correct");
    expect(bedrock).toHaveBeenCalledTimes(1);
  });
});

describe("a number it reports is checked against the words before it is marked", () => {
  it("is marked when the words are the number or sound like it, with no table of sound-alikes", async () => {
    for (const heard of ["ten oranges", "I think it is ten", "Tim", "Then", "tin"]) {
      expect((await calls("mark_answer", { said: 10 }, heard)).reply.verdict, heard).toBe("correct");
    }
  });

  it("is a wrong answer, with the plan's hint, when it is the number the child said", async () => {
    const { reply } = await calls("mark_answer", { said: 11 }, "eleven", ["Count on from five."]);
    expect([reply.verdict, reply.say]).toEqual(["wrong", "Count on from five."]);
  });

  it("is not marked when the words are not that number and do not sound like it, which is a model inventing one", async () => {
    await teacherAsked({ tool: { name: "mark_answer", args: { said: 20 } } }, ask("To recent."));
    await teacherAsked({ tool: { name: "mark_answer", args: { said: 10 } } }, ask("eleven"));
    await teacherAsked({ tool: { name: "mark_answer" } }, ask("Tim"));
  });
});

describe("what leaves the marking to read it", () => {
  it("is a word or two called garbled or something else, which may be a right answer written as a sound-alike", async () => {
    for (const action of ["ask_again", "answer_child"]) {
      await teacherAsked({ tool: { name: action, args: { reply: "Good try. How many?" } } }, ask("tin"));
    }
  });

  it("is a reply refused by the checks or saying the answer", async () => {
    await teacherAsked({ tool: { name: "answer_child", args: { reply: "Tell me where you live." } }, fit: false }, ask("Can I go home"));
    for (const reply of ["It is ten, say ten.", "The answer is 10.", "Five and five make ten, my dear."]) {
      await teacherAsked({ tool: { name: "answer_child", args: { reply } } }, ask("What is the answer?"));
    }
  });

  it("is a refusal from Bedrock, a tool that is not one of ours, or a model that chose nothing", async () => {
    await teacherAsked({ refuse: true }, ask("I want football"));
    await teacherAsked({ tool: { name: "constructor" } }, ask("I want football"));
    await teacherAsked({ tool: null }, ask("I want football"));
  });
});

describe("where the router is not used", () => {
  it("is off, in another language, for a question whose answer is a word, without a question, or for nothing said", async () => {
    const off = setup({ tool: { name: "not_know" } }, "");
    await expect(takeTurn(off.env, ask("I no sabi"))).rejects.toThrow("the teacher was asked");
    expect(off.bedrock).not.toHaveBeenCalled();
    for (const turn of [{ ...ask("Mi ò mọ̀"), language: "yo" }, { ...ask("Circle."), expect: { kind: "fact" as const, item: "circle" } }, { ...ask("what"), prompt: "  " }, ask("")]) {
      const { env, bedrock } = setup({ tool: { name: "not_know" } });
      await takeTurn(env, turn).catch(() => undefined);
      expect(bedrock).not.toHaveBeenCalled();
    }
  });

  it("asks Bedrock with the key and all the tools, and never the answer", async () => {
    const { reply, bedrock } = await calls("answer_child", { reply: "Soon. How many oranges?" }, "Can I go to the toilet?");
    expect(reply.heard).toBe("conversation");
    const [url, init] = bedrock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    const sent = JSON.parse(init.body);
    expect(url).toContain("bedrock-mantle.us-east-1.api.aws/openai/v1/chat/completions");
    expect(init.headers.authorization).toBe("Bearer test");
    expect(sent.tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual(["mark_answer", "ask_again", "not_know", "repeat_question", "needs_help", "answer_child"]);
    expect(JSON.stringify(sent.messages)).not.toMatch(/"10"|\bten\b/);
  });
});
