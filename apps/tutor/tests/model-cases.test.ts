import { describe, expect, it } from "vitest";
import { differences, linesOf, readings, type Reading } from "../bench/model-cases";
import type { Labels } from "../bench/observation-set";

describe("the lines a model writes", () => {
  it("are read with their number: every digit of it, whatever is numbered or bulleted before it", () => {
    expect(linesOf("10 | it is ten\n1. 12 | twelve\n- 7 | seven\n* 42 | forty two", "number")).toEqual([
      { heard: "it is ten", number: 10 }, { heard: "twelve", number: 12 }, { heard: "seven", number: 7 }, { heard: "forty two", number: 42 },
    ]);
  });

  it("leave out a line that does not follow the form, and strip quotation marks", () => {
    expect(linesOf('here are your lines:\n3 | "three"\nno bar here', "number")).toEqual([{ heard: "three", number: 3 }]);
    expect(linesOf('"I need the toilet"\n\nsay it again please\n4 | a number where none is wanted', "none")).toEqual([{ heard: "I need the toilet", number: null }, { heard: "say it again please", number: null }]);
  });
});

const labels = (extra: Partial<Labels>): Labels => ({ answer: null, dont_know: false, repeat_request: false, physical_need: null, safety: null, child_question: false, off_topic: false, unintelligible: false, ...extra });

describe("the blind second reading", () => {
  it("is read from numbered lines of an answer and labels", () => {
    expect(readings("1 | 10 | -\n2 | - | toilet, illness\n 3. | - | dont_know\nnoise")).toEqual([
      { n: 1, answer: 10, flags: new Set() }, { n: 2, answer: null, flags: new Set(["toilet", "illness"]) }, { n: 3, answer: null, flags: new Set(["dont_know"]) },
    ]);
  });

  it("differs from a case's labels in exactly the fields they disagree on", () => {
    const read = (answer: number | null, ...flags: string[]): Reading => ({ n: 1, answer, flags: new Set(flags) });
    expect(differences(labels({ answer: 10, physical_need: "toilet" }), read(10, "toilet"))).toEqual([]);
    expect(differences(labels({ answer: 10 }), read(12))).toEqual(["answer 10 vs 12"]);
    expect(differences(labels({ safety: "injury" }), read(null, "illness"))).toEqual(["illness false vs true", "injury true vs false"]);
    expect(differences(labels({ dont_know: true }), read(null))).toEqual(["dont_know true vs false"]);
  });
});
