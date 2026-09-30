import { describe, expect, it } from "vitest";
import { lineProblems } from "../src/guard";
import { STEADY_LINES } from "../src/lines";
import { praiseLine } from "../src/praise";
import type { Ask } from "../src/turn";

const fact = (item: string, prompt = "What is six times seven?", over: Partial<Ask> = {}): Ask => ({
  prompt,
  heard: "forty two",
  language: "en",
  expect: { kind: "fact", item },
  ...over,
});
const list = (prompt = "Count from one to five."): Ask => ({
  prompt,
  heard: "1, 2, 3, 4, 5",
  language: "en",
  expect: { kind: "sequence", item: "counting", items: [{ id: "1", spoken: ["1", "one"] }] },
});

describe("the praise for a right answer", () => {
  it("names the number for a fact, in words", () => {
    expect(praiseLine(fact("6x7"))).toMatch(/forty[ -]two/i);
    expect(praiseLine(fact("6x7"))).not.toMatch(/\d/);
    expect(praiseLine(fact("6x7"))).not.toBe(STEADY_LINES.correct.en);
  });

  it("is a line a child may hear, whatever the number", () => {
    for (const item of ["0", "1", "9", "12", "100", "101", "999", "1500", "25000", "3x3", "12x12", "9x9"]) {
      for (let at = 0; at < 12; at += 1) {
        const line = praiseLine(fact(item, `Question number ${at}`));
        expect(line, `${item} ${at}`).not.toBeNull();
        expect(lineProblems(line as string), `${item}: ${line}`).toEqual([]);
      }
    }
  });

  it("praises a list without reading it back, and a word answer without inventing", () => {
    for (let at = 0; at < 8; at += 1) {
      const line = praiseLine(list(`Count ${at}`)) as string;
      expect(lineProblems(line), line).toEqual([]);
      expect(line).not.toMatch(/\b(two|three|four|five)\b|\d/i);
    }
    expect(praiseLine(fact("monday"))).not.toBeNull();
  });

  it("is the same for the same question, and differs across questions", () => {
    expect(praiseLine(fact("6x7", "What is six times seven?"))).toBe(praiseLine(fact("6x7", "What is six times seven?")));
    const seen = new Set(Array.from({ length: 24 }, (_, at) => praiseLine(list(`Count ${at}`))));
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it("is never a line the child has already been told for this question", () => {
    const first = praiseLine(fact("6x7")) as string;
    const again = praiseLine(fact("6x7", undefined, { earlier: [{ verdict: "correct", line: first }] })) as string;
    expect(again).not.toBe(first);
    expect(lineProblems(again)).toEqual([]);
  });

  it("never repeats the line just said, however many have been told", () => {
    let earlier: NonNullable<Ask["earlier"]> = [];
    let last = "";
    for (let answer = 0; answer < 12; answer += 1) {
      const line = praiseLine({ ...list("Count"), earlier }) as string;
      expect(line).not.toBe(last);
      earlier = [{ verdict: "correct" as const, line }, ...earlier].slice(0, 4);
      last = line;
    }
  });

  it("names nothing for a word answer, and never speaks digits for a number too big to say", () => {
    const word = praiseLine(fact("triangle")) as string;
    expect(lineProblems(word)).toEqual([]);
    expect(word).not.toMatch(/triangle|\d/);
    for (const item of ["1000000000", "999999999", "123456789"]) {
      const line = praiseLine(fact(item)) as string;
      expect(lineProblems(line), line).toEqual([]);
    }
  });

  it("leaves other languages to the steady line", () => {
    expect(praiseLine(fact("6x7", undefined, { language: "yo" }))).toBeNull();
    expect(praiseLine(fact("6x7", undefined, { language: "pcm" }))).toBeNull();
  });
});
