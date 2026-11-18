import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canTuneOn, casesOf, loadSet, parseReal, problems, splitOf, type Row } from "../bench/observation-set";

const set = loadSet();
const row = (id: string, heard = "ten"): Row => ({
  id, source: "hand", heard, prompt: "What is five plus five?", expected: 10,
  labels: { answer: 10, dont_know: false, repeat_request: false, physical_need: null, safety: null, child_question: false, off_topic: false, unintelligible: false },
});

describe("the split rule", () => {
  it("is SHA-256 of the id, so these ids stay where they are (anyone can recompute them in any language)", () => {
    expect(["hand-001", "hand-002", "tpl.answer.p0.s0.w10.0.l", "gen.toilet.0.0", "stg-001", "x", "y", "z"].map(splitOf)).toEqual(["dev", "train", "test", "test", "test", "test", "dev", "train"]);
  });

  it("gives a case the same split whatever else is in the set or in what order", () => {
    const alone = new Map(set.map((r) => [r.id, splitOf(r.id)]));
    const shuffled = [...set].reverse().slice(40);
    for (const r of shuffled) expect(splitOf(r.id)).toBe(alone.get(r.id));
  });

  it("makes about three in five train and one in five each dev and test", () => {
    const counts = { train: 0, dev: 0, test: 0 };
    for (let at = 0; at < 20_000; at += 1) counts[splitOf(`id-${at}`)] += 1;
    expect(counts.train / 20_000).toBeCloseTo(0.6, 1);
    expect(counts.dev / 20_000).toBeCloseTo(0.2, 1);
    expect(counts.test / 20_000).toBeCloseTo(0.2, 1);
  });

  it("splits the committed set into three that hold every case once and do not overlap", () => {
    const parts = (["train", "dev", "test"] as const).map((which) => casesOf(set, which));
    expect(parts.flat()).toHaveLength(set.length);
    expect(new Set(parts.flat().map((r) => r.id)).size).toBe(set.length);
  });

  it("allows tuning on dev and train and nowhere else", () => {
    expect(["dev", "train"].map(canTuneOn)).toEqual([true, true]);
    expect(["test", "routing", "all", "real"].map(canTuneOn)).toEqual([false, false, false, false]);
  });
});

describe("the committed set", () => {
  it("has no problem: ids unique, no repeated question and words, no stored split, labels that fit", () => {
    expect(problems(set)).toEqual([]);
  });

  it("holds at least 500 cases, 100 of them to tune on and 100 to test on", () => {
    expect(set.length).toBeGreaterThanOrEqual(500);
    expect(casesOf(set, "dev").length).toBeGreaterThanOrEqual(100);
    expect(casesOf(set, "test").length).toBeGreaterThanOrEqual(100);
  });

  it("holds no real child's turn, and names where each case came from", () => {
    expect(new Set(set.map((r) => r.source))).toEqual(new Set(["hand", "template", "staging", "gpt-oss-120b"]));
  });

  it("covers every field at least thirty times, and the overlaps of an answer with a need or a safety concern", () => {
    const count = (test: (r: Row) => boolean) => set.filter(test).length;
    for (const field of ["dont_know", "repeat_request", "child_question", "off_topic", "unintelligible"] as const) expect(count((r) => r.labels[field]), field).toBeGreaterThanOrEqual(30);
    for (const need of ["toilet", "water"] as const) expect(count((r) => r.labels.physical_need === need), need).toBeGreaterThanOrEqual(30);
    for (const safety of ["illness", "injury", "fear", "wants_grownup"] as const) expect(count((r) => r.labels.safety === safety), safety).toBeGreaterThanOrEqual(30);
    expect(count((r) => r.labels.answer !== null && r.labels.physical_need !== null)).toBeGreaterThanOrEqual(30);
    expect(count((r) => r.labels.answer !== null && r.labels.safety !== null)).toBeGreaterThanOrEqual(30);
  });

  it("keeps the router's 82 cases, so the two tables stay comparable", () => {
    expect(casesOf(set, "routing")).toHaveLength(82);
  });
});

describe("what is wrong with a set", () => {
  it("names an id used twice, the same words to the same question, a stored split and a real turn", () => {
    const found = problems([row("a"), row("a", "eleven"), row("b", "Ten."), { ...row("c", "twelve"), split: "dev" } as Row, { ...row("d", "thirteen"), source: "real" }]);
    expect(found).toEqual(expect.arrayContaining(["id used twice: a", expect.stringContaining("c: stores a split"), expect.stringContaining("d: a real child's turn is in the synthetic set")]));
    expect(problems([row("e"), row("f")])).toEqual(["f: the same words to the same question as an earlier case"]);
  });

  it("refuses labels that cannot both be true", () => {
    const labels = row("g").labels;
    expect(problems([{ ...row("g"), labels: { ...labels, unintelligible: true } }])).toEqual(["g: garbled words cannot also say something"]);
    expect(problems([{ ...row("h"), labels: { ...labels, dont_know: true } }])).toEqual(["h: not knowing and an answer together"]);
    expect(problems([{ ...row("i"), labels: { ...labels, answer: null, physical_need: "water", safety: "fear" } }])[0]).toContain("a need and a safety concern");
  });
});

describe("the file of real turns", () => {
  const real = (id: string, source: string) => JSON.stringify({ ...row(id), source });

  it("is read only when every row says it is a real turn", () => {
    expect(parseReal(`${real("real-1", "real")}\n${real("real-2", "real")}`)).toHaveLength(2);
    expect(() => parseReal(`${real("real-1", "real")}\n${real("hand-001", "hand")}`)).toThrow("1 rows are not real turns");
    expect(() => parseReal(real("real-3", "hand"))).toThrow("not real turns");
    expect(() => parseReal(real("hand-3", "real"))).toThrow("not real turns");
  });

  it("is never inside this repository: the ignore rules keep a stray copy out of git", () => {
    const ignore = readFileSync(new URL("../../../.gitignore", import.meta.url).pathname, "utf8");
    expect(ignore).toContain("*.real.jsonl");
  });
});
