import { describe, expect, it, vi } from "vitest";
import { CLEF_MODEL, KIND_MIN, VALUE_LEAD, VALUE_MIN, readWithClef } from "../src/interpret";
import { NOT_HEARD } from "../src/phrasebook";
import { READER_MODEL } from "../src/read";
import { takeTurn, type Ask } from "../src/turn";

type Probabilities = Record<string, number>;
interface Script {
  hang?: boolean;
  kind?: Probabilities;
  value?: Probabilities;
  clefFails?: boolean;
  reader?: number | null;
}

/** Workers AI as the tutor sees it: Clef and the small reader answer from the script, and the teacher is never to be asked. */
function tutor(script: Script, interpreter = "clef") {
  const asked: string[] = [];
  const env = {
    INTERPRETER: interpreter,
    AI: {
      run: async (model: string) => {
        asked.push(model);
        if (model === CLEF_MODEL) {
          if (script.clefFails) throw new Error("5006");
          if (script.hang) return new Promise(() => undefined);
          return { answers: { kind: { probabilities: script.kind }, value: { probabilities: script.value } } };
        }
        if (model === READER_MODEL) return { choices: [{ message: { content: JSON.stringify({ answer: script.reader ?? null }) } }] };
        throw new Error("the teacher was asked");
      },
    },
  } as unknown as Env;
  return { env, asked };
}

const number = (kind: number, value: string, valueP: number): Script => ({
  kind: { number: kind, dont_know: (1 - kind) / 2, unclear: (1 - kind) / 2 },
  value: { [value]: valueP, none: 1 - valueP },
});
const ask = (heard: string, item = "10", hints?: string[]): Ask => ({
  prompt: "Two heaps of five. How many?",
  heard,
  language: "en",
  expect: { kind: "fact", item, ...(hints ? { hints } : {}) },
});

describe("what Clef read, and how sure it had to be", () => {
  it("is the number when it is sure of both what the child did and which number", async () => {
    expect(await readWithClef(tutor(number(0.95, "10", 0.8)).env, "Tim")).toEqual({ kind: "number", value: 10 });
  });

  it("is unclear when it is not sure enough of either, which is asked again and never marked", async () => {
    expect(await readWithClef(tutor(number(KIND_MIN - 0.05, "10", 0.9)).env, "x")).toEqual({ kind: "unclear" });
    expect(await readWithClef(tutor(number(0.95, "10", VALUE_MIN - 0.05)).env, "x")).toEqual({ kind: "unclear" });
    expect(await readWithClef(tutor({ kind: { number: 0.95, dont_know: 0.03, unclear: 0.02 }, value: { none: 0.9, "7": 0.1 } }).env, "x")).toEqual({ kind: "unclear" });
  });

  it("is not knowing when it is sure of that, and nothing at all when it gave no answer", async () => {
    expect(await readWithClef(tutor({ kind: { number: 0.02, dont_know: 0.96, unclear: 0.02 } }).env, "Items")).toEqual({ kind: "dont_know" });
    expect(await readWithClef(tutor({}).env, "x")).toBeNull();
  });
});

describe("when what Clef read is not used", () => {
  it("is not asked about more than a few words, which hold a number the small reader can check", async () => {
    const { env, asked } = tutor(number(0.95, "10", 0.8));
    expect(await readWithClef(env, "I think it is the ten sir")).toBeNull();
    expect(asked).toEqual([]);
  });

  it("is not asked for another language", async () => {
    const { env, asked } = tutor(number(0.95, "10", 0.8));
    expect(await readWithClef(env, "Tim", "yo")).toBeNull();
    expect(asked).toEqual([]);
  });

  it("is unclear when the number does not lead the next most likely by enough, or is no key of the numbers", async () => {
    const near = tutor({ kind: { number: 0.95, dont_know: 0.03, unclear: 0.02 }, value: { "10": 0.5, "11": 0.5 - VALUE_LEAD / 2 + 0.01, none: VALUE_LEAD / 2 - 0.01 } });
    expect(await readWithClef(near.env, "Ten")).toEqual({ kind: "unclear" });
    const odd = tutor({ kind: { number: 0.95, dont_know: 0.03, unclear: 0.02 }, value: { seven: 0.9, none: 0.1 } });
    expect(await readWithClef(odd.env, "Ten")).toEqual({ kind: "unclear" });
  });

  it("is nothing where the numbers are no probabilities, so the small reader is used", async () => {
    expect(await readWithClef(tutor({ kind: { number: 90, unclear: 5 } }).env, "Tim")).toBeNull();
  });

  it("is given up on after a few seconds, and the small reader answers", async () => {
    vi.useFakeTimers();
    try {
      const { env, asked } = tutor({ hang: true, reader: 10 });
      const turn = takeTurn(env, ask("ten"));
      await vi.advanceTimersByTimeAsync(4100);
      expect((await turn).verdict).toBe("correct");
      expect(asked).toEqual([CLEF_MODEL, READER_MODEL]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a number answered where Clef reads what the child meant", () => {
  it("tries the small reader when Clef cannot tell, before asking again", async () => {
    const { env } = tutor({ kind: { number: KIND_MIN - 0.1, dont_know: 0.1, unclear: 0.2 }, reader: 10 });
    expect((await takeTurn(env, ask("ten please"))).verdict).toBe("correct");
  });

  it("leaves a plain I can't as not knowing, and so a try, when Clef could not tell", async () => {
    const { env } = tutor({ kind: { number: 0.3, dont_know: 0.2, unclear: 0.5 } });
    const reply = await takeTurn(env, ask("I can't", "10", ["Think of two heaps."]));
    expect([reply.heard, reply.say]).toEqual(["dont_know", "Think of two heaps."]);
  });

  it("marks the number Clef read as any is, a right one correct and a wrong one wrong", async () => {
    expect((await takeTurn(tutor(number(0.95, "10", 0.8)).env, ask("Tim"))).verdict).toBe("correct");
    const wrong = await takeTurn(tutor(number(0.95, "11", 0.8)).env, ask("Lemon", "10", ["Count on from five."]));
    expect([wrong.verdict, wrong.say]).toEqual(["wrong", "Count on from five."]);
  });

  it("asks a few unreadable words again from the phrasebook, and counts it no try", async () => {
    const reply = await takeTurn(tutor({ kind: { number: 0.3, dont_know: 0.2, unclear: 0.5 } }).env, ask("Chainsaw"));
    expect([reply.verdict, reply.heard]).toEqual(["unheard", "garbled"]);
    expect(NOT_HEARD).toContain(reply.say);
  });

  it("leaves a long sentence Clef cannot tell to the teacher, as before", async () => {
    const { env } = tutor({ kind: { number: 0.3, dont_know: 0.2, unclear: 0.5 } });
    await expect(takeTurn(env, ask("my name is Ade and I want to go"))).rejects.toThrow("the teacher was asked");
  });

  it("meets a child Clef says did not know with the next hint, as a try", async () => {
    const reply = await takeTurn(tutor({ kind: { number: 0.02, dont_know: 0.96, unclear: 0.02 } }).env, ask("Items", "10", ["Think of two heaps.", "Five, then five more."]));
    expect([reply.verdict, reply.heard, reply.say]).toEqual(["unheard", "dont_know", "Think of two heaps."]);
  });

  it("goes on to the small reader when Clef cannot answer, and is not asked at all where it is not switched on", async () => {
    const failing = tutor({ clefFails: true, reader: 10 });
    expect((await takeTurn(failing.env, ask("ten please"))).verdict).toBe("correct");
    expect(failing.asked).toEqual([CLEF_MODEL, READER_MODEL]);
    const off = tutor({ ...number(0.95, "10", 0.8), reader: 10 }, "");
    expect((await takeTurn(off.env, ask("ten please"))).verdict).toBe("correct");
    expect(off.asked).toEqual([READER_MODEL]);
  });

  it("is not asked for an answer larger than the numbers it is offered, which the small reader reads", async () => {
    const big = tutor({ ...number(0.95, "10", 0.8), reader: 300 });
    expect((await takeTurn(big.env, ask("three hundred", "300"))).verdict).toBe("correct");
    expect(big.asked).toEqual([READER_MODEL]);
  });

  it("reads a sound-alike the table holds without asking Clef", async () => {
    const { env, asked } = tutor(number(0.95, "9", 0.9));
    expect((await takeTurn(env, ask("Nein.", "9"))).verdict).toBe("correct");
    expect(asked).toEqual([]);
  });
});
