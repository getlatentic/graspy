import { describe, expect, it } from "vitest";
import { jsonValues, shadowLines, summary } from "../bench/shadow-report";

const line = (fields: object) => JSON.stringify({ part: "observer-shadow", ...fields });
const event = (...messages: string[]) => JSON.stringify({ outcome: "ok", logs: [{ message: messages }] }, null, 4);

describe("reading a tail of the tutor Worker", () => {
  it("finds values left one after another, pretty printed, with braces inside strings", () => {
    expect(jsonValues('{"a": "}{"}\n{"b": [1, {"c": 2}]} noise {"d": "\\"}"}')).toEqual([{ a: "}{" }, { b: [1, { c: 2 }] }, { d: '"}' }]);
  });

  it("takes the shadow lines from tail events and bare lines, and nothing else", () => {
    const text = [event(line({ taken: "mark_answer", observer: "mark_answer", agree: true }), JSON.stringify({ part: "route", ms: 5 })), line({ decidedBy: "rule", taken: "needs_help" })].join("\n");
    expect(shadowLines(text)).toHaveLength(2);
  });
});

describe("the summary by kind of turn", () => {
  it("counts each kind, where the two differ and how long the observer took", () => {
    const text = [
      line({ decidedBy: "router", taken: "mark_answer", observer: "mark_answer", agree: true, ms: 800 }),
      line({ decidedBy: "router", taken: "mark_answer", observer: "needs_grownup", agree: false, ms: 1200 }),
      line({ decidedBy: "router", taken: null, observer: "none", agree: false, ms: null }),
      line({ decidedBy: "rule", taken: "needs_help", observer: "needs_help", agree: true, ms: 900 }),
    ].join("\n");
    const report = summary(shadowLines(text));
    expect(report).toContain("router: 3 turns | observer gave nothing 1 | agree 1 of 2");
    expect(report).toContain("1 x tutor mark_answer, observer needs_grownup");
    expect(report).toContain("rule: 1 turns | observer gave nothing 0 | agree 1 of 1");
  });

  it("does not count a turn the observer decided as an agreement", () => {
    const report = summary(shadowLines(line({ decidedBy: "observer", taken: "needs_help", observer: "needs_help", agree: null, ms: 900 })));
    expect(report).toBe("observer: 1 turns it decided itself (nothing to compare with)");
  });

  it("never prints the child's words where the log holds them", () => {
    const report = summary(shadowLines(line({ decidedBy: "rule", taken: "needs_help", observer: "needs_help", agree: true, ms: 1, heard: "I am hurt", answer: { value: 3 } })));
    expect(report).not.toMatch(/hurt/);
  });

  it("says so where there is nothing", () => {
    expect(summary([])).toBe("no observer-shadow lines");
  });
});
