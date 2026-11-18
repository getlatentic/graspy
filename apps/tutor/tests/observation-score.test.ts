import { describe, expect, it } from "vitest";
import type { Labels, Row } from "../bench/observation-set";
import { ideal, render, score, type Reply } from "../bench/observation-score";

const NONE: Labels = { answer: null, dont_know: false, repeat_request: false, physical_need: null, safety: null, child_question: false, off_topic: false, unintelligible: false };
const row = (id: string, heard: string, labels: Partial<Labels>, source: Row["source"] = "hand"): Row => ({ id, source, heard, prompt: "What is five plus five?", expected: 10, labels: { ...NONE, ...labels } });
const THRESHOLDS = { safety: 0.4, need: 0.5, answer: 0.6, dont_know: 0.5, repeat_request: 0.5, talk: 0.5, unintelligible: 0.5 };
const zero = { dont_know: 0, repeat_request: 0, unintelligible: 0, child_question: 0, off_topic: 0 };
const reply = (over: { answer?: { value: number; confidence: number } | null; communication?: Record<string, number>; physicalNeed?: Record<string, number>; safety?: Record<string, number> }, route: Reply["route"]): Reply => ({
  observation: { answer: over.answer ?? null, communication: { ...zero, ...over.communication }, physicalNeed: { toilet: 0, water: 0, ...over.physicalNeed }, safety: { illness: 0, injury: 0, fear: 0, wants_grownup: 0, ...over.safety } },
  route, ms: 800, thresholds: THRESHOLDS,
});

describe("what the controller should do for what a child communicated", () => {
  it("takes safety before a need before an answer before the rest", () => {
    expect(ideal({ ...NONE, safety: "fear", physical_need: "toilet", answer: 10 })).toEqual({ action: "needs_grownup" });
    expect(ideal({ ...NONE, physical_need: "toilet", answer: 10 })).toEqual({ action: "needs_help" });
    expect(ideal({ ...NONE, answer: 10, dont_know: false })).toEqual({ action: "mark_answer", said: 10 });
    expect(ideal({ ...NONE, dont_know: true, off_topic: true })).toEqual({ action: "not_know" });
    expect(ideal({ ...NONE, unintelligible: true })).toEqual({ action: "ask_again" });
    expect(ideal(NONE)).toBeNull();
  });
});

describe("scoring an observer", () => {
  const rows = [
    row("a", "ten", { answer: 10 }),
    row("b", "I need the toilet please", { physical_need: "toilet" }, "template"),
    row("c", "my tummy hurts", { safety: "illness" }, "template"),
    row("d", "what is a heap of oranges", { child_question: true }, "gpt-oss-120b"),
  ];
  const replies = [
    reply({ answer: { value: 10, confidence: 0.9 } }, { action: "mark_answer", said: 10 }),
    reply({ physicalNeed: { toilet: 0.9 } }, { action: "needs_help" }),
    reply({}, null),
    reply({ communication: { child_question: 0.8 } }, { action: "answer_child" }),
  ];
  const report = score(rows, replies, true);

  it("counts what was decided right, by source, and a need or safety concern that was missed", () => {
    expect(report.outcome).toMatchObject({ right: 3, "need or safety missed": 1, "wrong number": 0 });
    expect(report.bySource).toEqual({ hand: { cases: 1, right: 1 }, template: { cases: 2, right: 1 }, "gpt-oss-120b": { cases: 1, right: 1 } });
  });

  it("counts each field's true and false findings at its threshold", () => {
    const need = report.fields.find((f) => f.name === "physical need")!;
    const safety = report.fields.find((f) => f.name === "safety")!;
    expect([need.tp, need.fp, need.fn]).toEqual([1, 0, 0]);
    expect([safety.tp, safety.fp, safety.fn]).toEqual([0, 0, 1]);
    expect(report.answer).toEqual({ exact: 1, withAnswer: 1, invented: 0, withoutAnswer: 3 });
  });

  it("leaves a case with no observation out of every count and says so", () => {
    const partial = score(rows, [{ ...replies[0], observation: null, route: null }, ...replies.slice(1)], true);
    expect(partial.noObservation).toBe(1);
    expect(partial.outcome.right).toBe(2);
  });

  it("names the words of a case that was missed when they may be shown", () => {
    expect(report.bad).toEqual(["wanted needs_grownup, got nothing: my tummy hurts"]);
    expect(report.fields.find((f) => f.name === "safety")!.misses).toEqual(["missed: my tummy hurts"]);
  });

  it("names only the id of a case where the words are a real child's, in every line of the report", () => {
    const real = score(rows.map((r) => ({ ...r, source: "real" as const })), replies, false);
    const text = render(real, "real").join("\n");
    expect(text).toContain("wanted needs_grownup, got nothing: c");
    for (const words of ["my tummy hurts", "toilet please", "heap of oranges"]) expect(text).not.toContain(words);
  });
});
