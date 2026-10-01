import { describe, expect, it } from "vitest";
import { lineProblems } from "../src/guard";
import { numberWords } from "../src/lines";
import { RIGHT, RIGHT_LIST, RIGHT_NUMBER, allLines, exampleBlock, withNumber } from "../src/phrasebook";
import { praiseLine } from "../src/praise";
import { takeTurn, type Ask } from "../src/turn";

describe("the teacher's phrasebook", () => {
  it("holds only lines a child may hear, with any number the child could say", () => {
    for (const n of [0, 1, 9, 12, 45, 100, 1500, 25000]) {
      for (const line of allLines(numberWords(n))) expect(lineProblems(line), `${n}: ${line}`).toEqual([]);
    }
  });

  it("writes the number in, and starts a sentence with it capitalised", () => {
    expect(withNumber("Yes, {number}! Very good.", "forty-two")).toBe("Yes, forty-two! Very good.");
    expect(withNumber("{Number}! Excellent.", "forty-two")).toBe("Forty-two! Excellent.");
  });

  it("is where praise for a right answer comes from", () => {
    const fact = (item: string): Ask => ({ prompt: `Question ${item}`, heard: "x", language: "en", expect: { kind: "fact", item } });
    const list = { prompt: "Count", heard: "x", language: "en", expect: { kind: "sequence", item: "c", items: [{ id: "1", spoken: ["1"] }] } } as Ask;
    expect(RIGHT_NUMBER.map((line) => withNumber(line, "forty-two"))).toContain(praiseLine(fact("6x7")));
    expect(RIGHT_LIST).toContain(praiseLine(list));
    expect(RIGHT).toContain(praiseLine(fact("triangle")));
  });

  it("tells the model, for a list, to name only how far the child got", async () => {
    const seen: string[] = [];
    const env = {
      AI: { run: async (_m: string, input: { messages: { content: string }[] }) => (seen.push(JSON.stringify(input.messages)), { choices: [{ message: { content: "", tool_calls: [] } }] }) },
    } as unknown as Env;
    const items = [{ id: "1", spoken: ["1", "one"] }, { id: "2", spoken: ["2", "two"] }];
    await takeTurn(env, { prompt: "Count.", heard: "one three", language: "en", expect: { kind: "sequence", item: "c", items } }).catch(() => undefined);
    expect(seen.find((call) => call.includes("class teacher"))).toContain("say only how far they got");
  });

  it("is shown to the model as how the teacher sounds", async () => {
    const seen: string[] = [];
    const env = {
      AI: {
        run: async (_model: string, input: { messages: { content: string }[] }) => {
          seen.push(JSON.stringify(input.messages));
          return { choices: [{ message: { content: "", tool_calls: [] } }] };
        },
      },
    } as unknown as Env;
    await takeTurn(env, { prompt: "Say five.", heard: "four", language: "en", expect: { kind: "fact", item: "5" } }).catch(() => undefined);
    const brief = seen.find((call) => call.includes("class teacher")) ?? "";
    for (const example of exampleBlock()) expect(brief).toContain(example.replace(/"/g, '\\"'));
    expect(exampleBlock().length).toBeGreaterThanOrEqual(4);
  });
});
