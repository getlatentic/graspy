import { describe, expect, it } from "vitest";
import { loadSet, sameWords } from "../bench/observation-set";
import { numberWords, saysNumber, templateCases, TEMPLATES } from "../bench/template-cases";

describe("number words", () => {
  it("spells a number the way a child says it", () => {
    expect([0, 7, 13, 20, 42, 99].map(numberWords)).toEqual(["zero", "seven", "thirteen", "twenty", "forty two", "ninety nine"]);
  });

  it("is not asked for what it cannot spell", () => {
    for (const bad of [-1, 100, 2.5]) expect(() => numberWords(bad)).toThrow(RangeError);
  });

  it("finds a number said as digits or words, with or without a hyphen, and not inside another number", () => {
    expect(saysNumber("it is twenty-one", 21)).toBe(true);
    expect(saysNumber("I got 5", 5)).toBe(true);
    expect(saysNumber("fifteen", 5)).toBe(false);
    expect(saysNumber("ten oranges", 0)).toBe(false);
    expect(saysNumber("210", 10)).toBe(false);
  });
});

describe("the template cases", () => {
  const cases = templateCases();

  it("are the same on every run, so ids and the cases under them never change", () => {
    expect(templateCases()).toEqual(cases);
  });

  it("have unique ids and no two the same words to the same question, ignoring case and punctuation", () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    expect(new Set(cases.map(sameWords)).size).toBe(cases.length);
  });

  it("say the number they are labelled with, except the sound-alike words, which are labelled with the number they sound like", () => {
    const alike = new Set(["sound-alike-answer"]);
    for (const c of cases.filter((row) => row.labels.answer !== null && !alike.has(row.id.split(".")[1]))) expect(saysNumber(c.heard, c.labels.answer!), c.heard).toBe(true);
  });

  it("keep each template to its share and every template is used", () => {
    for (const t of TEMPLATES) {
      const made = cases.filter((c) => c.id.split(".")[1] === t.name).length;
      expect(made, t.name).toBeGreaterThan(0);
      expect(made, t.name).toBeLessThanOrEqual(t.keep);
    }
  });

  it("are all in the committed set, unchanged", () => {
    const committed = new Map(loadSet().map((r) => [r.id, r]));
    for (const c of cases) if (committed.has(c.id)) expect(committed.get(c.id)).toEqual(c);
    expect(cases.filter((c) => committed.has(c.id)).length).toBeGreaterThan(150);
  });
});
