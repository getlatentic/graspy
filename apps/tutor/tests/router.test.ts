import { afterEach, describe, expect, it, vi } from "vitest";
import { JUDGE_MODEL, SAFETY_MODEL } from "../src/guard";
import { NEEDS_GROWNUP, NEEDS_HELP, NOT_HEARD } from "../src/phrasebook";
import { READER_MODEL } from "../src/read";
import { ACTIONS } from "../src/router";
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

  it("sends a child who is hurt, ill or frightened to a grown-up, with the lesson able to stop", async () => {
    for (const [action, heard] of [["answer_child", "my stomach is paining me"], ["ask_again", "I am scared"], ["not_know", "my head is bleeding"]]) {
      const { reply } = await calls(action, { reply: "Let us finish first." }, heard);
      expect(NEEDS_GROWNUP, heard).toContain(reply.say);
    }
  });

  it("sends a child who is hurt to a grown-up even when they also gave an answer, since safety comes before marking", async () => {
    for (const heard of ["I feel dizzy and I think it is ten", "ten but my tummy is paining me"]) {
      const { reply } = await calls("mark_answer", { said: 10 }, heard);
      expect(NEEDS_GROWNUP, heard).toContain(reply.say);
      expect(reply.verdict, heard).toBe("unheard");
    }
  });

  it("lets a child who needs the toilet go even when they also gave an answer", async () => {
    const { reply } = await calls("mark_answer", { said: 10 }, "ten and I need the toilet");
    expect(NEEDS_HELP).toContain(reply.say);
  });

  it("sends a child who says they feel sick, or ill, to a grown-up before any answer is marked", async () => {
    for (const heard of ["I feel sick and I think it is ten", "I am ill, ten", "my leg is aching, ten"]) {
      const { reply } = await calls("mark_answer", { said: 10 }, heard);
      expect(NEEDS_GROWNUP, heard).toContain(reply.say);
    }
  });

  it("marks a right answer that is only the number asked for misheard as a word for a need, or has water in a word problem", async () => {
    for (const heard of ["pain", "tummy", "ten glasses of water", "it is pain"]) {
      const { reply } = await calls("mark_answer", { said: 10 }, heard);
      expect(reply.verdict, heard).toBe("correct");
    }
  });

  it("marks the answer asked for even where the model took its misheard word for a need", async () => {
    for (const [tool, heard] of [["needs_grownup", "pain"], ["needs_help", "it is water"]]) {
      const { reply } = await calls(tool, undefined, heard);
      expect(reply.verdict, heard).toBe("correct");
    }
  });

  it("does not mark a need as the answer because a word in it sounds like the number asked for", async () => {
    for (const [item, heard] of [["2", "I need to go out"], ["4", "I need it for my friend"], ["1", "I won it, I need to go"]]) {
      const { env } = setup({ tool: { name: "needs_help" } });
      const reply = await takeTurn(env, { ...ask(heard), expect: { kind: "fact", item } });
      expect(NEEDS_HELP, heard).toContain(reply.say);
    }
  });

  it("leaves a water word problem to the marking where the model took it for a need", async () => {
    for (const [tool, item, heard] of [["needs_help", "10", "ten litres of water"], ["needs_help", "5", "five bottles of water"], ["needs_grownup", "3", "three buckets of water please"]]) {
      const { env } = setup({ tool: { name: tool } });
      await expect(takeTurn(env, { ...ask(heard), expect: { kind: "fact", item } }), heard).rejects.toThrow("the teacher was asked");
    }
  });

  it("lets a child go or sends them on in any kind of step, with nothing marked", async () => {
    const recitation: Ask["expect"] = { kind: "recitation", item: "table", table: 2, multipliers: [1, 2, 3] };
    const { env } = setup({});
    const toilet = await takeTurn(env, { ...ask("I need the toilet"), expect: recitation });
    expect(NEEDS_HELP).toContain(toilet.say);
    const hurt = await takeTurn(env, { ...ask("my stomach is paining me"), expect: recitation });
    expect([NEEDS_GROWNUP.includes(hurt.say), hurt.verdict]).toEqual([true, "unheard"]);
  });

  it("answers a need with no router at all: the router off, or it fails, or the step has the answer in it", async () => {
    const heard = "my head is bleeding";
    const off = setup({}, "off");
    expect(NEEDS_GROWNUP).toContain((await takeTurn(off.env, ask(heard))).say);
    expect(off.bedrock).not.toHaveBeenCalled();
    const failed = setup({ refuse: true });
    expect(NEEDS_GROWNUP).toContain((await takeTurn(failed.env, ask(heard))).say);
    const support = setup({});
    expect(NEEDS_GROWNUP).toContain((await takeTurn(support.env, { ...ask(heard), support: "modelled" as const })).say);
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

  it("is asked about an answer inside words, and the number it reports is marked", async () => {
    const { reply, bedrock } = await calls("mark_answer", { said: 10 }, "ten oranges");
    expect(reply.verdict).toBe("correct");
    expect(bedrock).toHaveBeenCalledTimes(1);
  });

  it("is not asked about nothing but a number, which is an answer with nothing to route", async () => {
    for (const heard of ["10", "ten", "twenty two"]) {
      const { env, bedrock } = setup({ tool: { name: "not_know" } });
      await takeTurn(env, ask(heard)).catch(() => undefined);
      expect(bedrock, heard).not.toHaveBeenCalled();
    }
  });
});

describe("a number it reports is checked against the words before it is marked", () => {
  it("is marked when the words are the number or sound like it, with no table of sound-alikes", async () => {
    for (const heard of ["ten oranges", "I think it is ten", "Tim", "Then", "tin"]) {
      expect((await calls("mark_answer", { said: 10 }, heard)).reply.verdict, heard).toBe("correct");
    }
  });

  it("is a wrong answer, with the plan's hint, when it is the number the child said", async () => {
    const { reply } = await calls("mark_answer", { said: 11 }, "eleven oranges", ["Count on from five."]);
    expect([reply.verdict, reply.say]).toEqual(["wrong", "Count on from five."]);
  });

  it("is not marked when the words are not that number and do not sound like it, which is a model inventing one", async () => {
    await teacherAsked({ tool: { name: "mark_answer", args: { said: 20 } } }, ask("To recent."));
    await teacherAsked({ tool: { name: "mark_answer", args: { said: 10 } } }, ask("eleven"));
    await teacherAsked({ tool: { name: "mark_answer" } }, ask("Tim"));
  });
});

describe("what leaves the marking to read it", () => {
  it("is an answer that the model chose not to treat as one: a number in the words, or a word or two that sounds like one", async () => {
    for (const action of ["not_know", "ask_again", "answer_child", "repeat_question"]) {
      for (const heard of ["it is ten oranges", "I think it is ten oranges because five and five", "tin"]) {
        await teacherAsked({ tool: { name: action, args: { reply: "Good try." } } }, ask(heard));
      }
    }
  });

  it("is a sound-alike the table reads, which the marking marks as the number it is, whatever the model chose", async () => {
    for (const action of ["not_know", "ask_again", "answer_child"]) {
      const { env } = setup({ tool: { name: action, args: { reply: "Good try." } } });
      expect((await takeTurn(env, ask("Nein."))).verdict, action).toBe("wrong");
    }
  });

  it("is a step asked as an echo or a probe, whose question holds the answer", async () => {
    const { env, bedrock } = setup({ tool: { name: "answer_child", args: { reply: "Say it again." } } });
    await takeTurn(env, { ...ask("I want football"), support: "modelled" }).catch(() => undefined);
    expect(bedrock).not.toHaveBeenCalled();
  });

  it("is a number the model reports that cannot be one: negative, huge, or not a whole number", async () => {
    for (const said of [-3, 1e21, 2.5, "10"]) {
      await teacherAsked({ tool: { name: "mark_answer", args: { said } } }, ask("negative tin"));
    }
  });

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
    const twentyOne: Ask = { ...ask("What is the answer?"), expect: { kind: "fact", item: "21" } };
    await teacherAsked({ tool: { name: "answer_child", args: { reply: "It is twenty one my dear." } } }, twentyOne);
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
    const { reply, bedrock } = await calls("answer_child", { reply: "Soon. How many oranges?" }, "Can I eat after this?");
    expect(reply.heard).toBe("conversation");
    const [url, init] = bedrock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    const sent = JSON.parse(init.body);
    expect(url).toContain("bedrock-mantle.us-east-1.api.aws/openai/v1/chat/completions");
    expect(init.headers.authorization).toBe("Bearer test");
    expect(sent.tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual(["mark_answer", "ask_again", "not_know", "repeat_question", "needs_help", "needs_grownup", "answer_child"]);
    expect(JSON.stringify(sent.messages)).not.toMatch(/"10"|\bten\b/);
  });
});

describe("the actions are told apart", () => {
  it("name the toilet and water for one action only, so no case is a positive example of two", () => {
    const naming = Object.entries(ACTIONS).filter(([, what]) => /toilet|water/i.test(what)).map(([name]) => name);
    expect(naming).toEqual(["needs_help"]);
    const hurt = Object.entries(ACTIONS).filter(([, what]) => /hurt|bleeding|frightened/i.test(what)).map(([name]) => name);
    expect(hurt).toEqual(["needs_grownup"]);
  });
});
