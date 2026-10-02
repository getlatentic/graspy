import { afterEach, describe, expect, it, vi } from "vitest";
import { JUDGE_MODEL, SAFETY_MODEL } from "../src/guard";
import { NEEDS_GROWNUP, NEEDS_HELP, NOT_HEARD } from "../src/phrasebook";
import { READER_MODEL } from "../src/read";
import { takeTurn, type Ask } from "../src/turn";

const QUESTION = "One heap has five oranges. How many oranges are in two heaps?";
const ask = (heard: string, support?: Ask["support"]): Ask => ({ prompt: QUESTION, heard, language: "en", expect: { kind: "fact", item: "10" }, ...(support ? { support } : {}) });

/** Bedrock reports the given observation; Workers AI runs the checks and the small reader, and the teacher is never to be asked. */
function setup(observation: Record<string, unknown> | null, flags: Record<string, string> = { OBSERVER: "on" }) {
  const bedrock = vi.fn(async () => {
    return new Response(JSON.stringify({ choices: [{ message: { content: observation ? JSON.stringify(observation) : "not json" } }] }), { status: 200 });
  });
  vi.stubGlobal("fetch", bedrock);
  const env = {
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
  return { env, bedrock };
}

afterEach(() => vi.unstubAllGlobals());

describe("what a child said, observed and then decided", () => {
  it("marks an answer the model read from a word that sounds like it", async () => {
    const { env, bedrock } = setup({ answer: { value: 10, confidence: 0.9 } });
    const reply = await takeTurn(env, ask("Then"));
    expect(reply.verdict).toBe("correct");
    expect(bedrock).toHaveBeenCalledTimes(1);
  });

  it("sends a child who is unwell to a grown-up although they gave the answer, with nothing marked", async () => {
    const { env } = setup({ answer: { value: 10, confidence: 0.97 }, safety: { illness: 0.9 } });
    const reply = await takeTurn(env, ask("my tummy is not fine but I think it is ten"));
    expect([NEEDS_GROWNUP.includes(reply.say), reply.verdict, reply.heard]).toEqual([true, "unheard", "conversation"]);
  });

  it("lets a child who is thirsty go, whatever else they said", async () => {
    const { env } = setup({ answer: { value: 10, confidence: 0.9 }, physical_need: { water: 0.8 } });
    expect(NEEDS_HELP).toContain((await takeTurn(env, ask("ten, I want a drink please"))).say);
  });

  it("marks a lone word for the answer that the model took for a complaint", async () => {
    const { env } = setup({ answer: { value: null, confidence: 0.1 }, safety: { illness: 0.9 } });
    expect((await takeTurn(env, ask("pain"))).verdict).toBe("correct");
  });

  it("does not mark a number the words could not be, however sure the model is", async () => {
    const { env } = setup({ answer: { value: 7, confidence: 0.99 } });
    await expect(takeTurn(env, ask("Lemon lemon lemon"))).rejects.toThrow("the teacher was asked");
  });

  it("asks again, from the phrasebook, for words nobody could read", async () => {
    const { env } = setup({ communication: { unintelligible: 0.9 } });
    const reply = await takeTurn(env, ask("Premisetina chainsaw lemon files"));
    expect([NOT_HEARD.includes(reply.say), reply.heard]).toEqual([true, "garbled"]);
  });

  it("is the usual marking where the model reports nothing, fails, or the observer is off", async () => {
    await expect(takeTurn(setup(null).env, ask("a long thing nobody can mark properly here"))).rejects.toThrow("the teacher was asked");
    const off = setup({ answer: { value: 10, confidence: 0.9 } }, {});
    await expect(takeTurn(off.env, ask("a long thing nobody can mark properly here"))).rejects.toThrow("the teacher was asked");
    expect(off.bedrock).not.toHaveBeenCalled();
  });

  it("is not used for a step that has the answer in its question", async () => {
    const { env, bedrock } = setup({ answer: { value: 10, confidence: 0.9 } });
    await expect(takeTurn(env, ask("a long thing nobody can mark properly here", "modelled"))).rejects.toThrow("the teacher was asked");
    expect(bedrock).not.toHaveBeenCalled();
  });

  it("sends the question and the words, and never the answer", async () => {
    const { env, bedrock } = setup({});
    await takeTurn(env, ask("hmm what")).catch(() => null);
    const [, init] = bedrock.mock.calls[0] as unknown as [string, { body: string }];
    const sent = JSON.parse(init.body);
    expect(Object.keys(sent.response_format.json_schema.schema.properties)).toEqual(["answer", "communication", "physical_need", "safety", "reply"]);
    expect(JSON.stringify(sent.messages)).not.toMatch(/"10"|\bten\b/);
  });
});
