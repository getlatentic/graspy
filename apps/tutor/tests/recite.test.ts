import { describe, expect, it } from "vitest";
import { markRecitation, markSequence, type HeardFact } from "../src/recite";

const TWOS = Array.from({ length: 12 }, (_, index) => index + 1);

const said = (multiplier: number, answer: number, evidence: string): HeardFact => ({
  multiplier,
  answer,
  evidence,
});

function wholeTable(table: number): { facts: HeardFact[]; transcript: string } {
  const facts = TWOS.map((m) => said(m, table * m, `${table} times ${m} is ${table * m}`));
  return { facts, transcript: facts.map((fact) => fact.evidence).join(", ") };
}

describe("marking a times table said in one go", () => {
  it("passes a table said right the whole way through", () => {
    const { facts, transcript } = wholeTable(2);
    const { verdict, result } = markRecitation(2, TWOS, facts, transcript);

    expect(verdict).toBe("correct");
    expect(result.correct_multipliers).toEqual(TWOS);
    expect(result.missing_multipliers).toEqual([]);
  });

  it("names the facts that were wrong and the ones never reached", () => {
    const transcript = "2 times 1 is 2, 2 times 2 is 5";
    const facts = [said(1, 2, "2 times 1 is 2"), said(2, 5, "2 times 2 is 5")];
    const { verdict, result } = markRecitation(2, TWOS, facts, transcript);

    expect(verdict).toBe("wrong");
    expect(result.correct_multipliers).toEqual([1]);
    expect(result.incorrect_facts).toEqual([{ multiplier: 2, expected: 4, heard: 5 }]);
    expect(result.missing_multipliers).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("calls a table with nothing recognisable in it unheard, not twelve mistakes", () => {
    const { verdict, result } = markRecitation(2, TWOS, [], "");

    expect(verdict).toBe("unheard");
    expect(result.missing_multipliers).toEqual(TWOS);
  });

  it("throws away a fact whose words are not in the recording", () => {
    const transcript = "2 times 1 is 2";
    const invented = [said(1, 2, "2 times 1 is 2"), said(2, 4, "2 times 2 is 4")];
    const { verdict, result } = markRecitation(2, TWOS, invented, transcript);

    expect(result.correct_multipliers).toEqual([1]);
    expect(result.missing_multipliers).toContain(2);
    expect(verdict).toBe("wrong");
  });

  it("does not mind how the words were punctuated or capitalised", () => {
    const transcript = "Two times one is two!";
    const { result } = markRecitation(2, [1], [said(1, 2, "two times one is two")], transcript);

    expect(result.correct_multipliers).toEqual([1]);
  });
});

const DAYS = [
  { id: "monday", spoken: ["monday"] },
  { id: "tuesday", spoken: ["tuesday", "chuseday"] },
  { id: "wednesday", spoken: ["wednesday"] },
];

describe("marking a list said in order", () => {
  it("passes a list said whole and in order", () => {
    const transcript = "monday tuesday wednesday";
    const { verdict, result } = markSequence(DAYS, ["monday", "tuesday", "wednesday"], transcript);

    expect(verdict).toBe("correct");
    expect(result.missing).toEqual([]);
    expect(result.out_of_order).toEqual([]);
  });

  it("accepts a spelling the curriculum lists for a child's accent", () => {
    const { result } = markSequence(DAYS, ["monday", "chuseday"], "monday chuseday");

    expect(result.said).toEqual(["monday", "tuesday"]);
  });

  it("names what was missed", () => {
    const { verdict, result } = markSequence(DAYS, ["monday", "wednesday"], "monday wednesday");

    expect(verdict).toBe("wrong");
    expect(result.missing).toEqual(["tuesday"]);
  });

  it("notices a list said out of order", () => {
    const transcript = "wednesday monday tuesday";
    const { verdict, result } = markSequence(DAYS, ["wednesday", "monday", "tuesday"], transcript);

    expect(verdict).toBe("wrong");
    expect(result.out_of_order.length).toBeGreaterThan(0);
  });

  it("never counts an item that is not in the recording", () => {
    const { result } = markSequence(DAYS, ["monday", "tuesday"], "monday");

    expect(result.said).toEqual(["monday"]);
    expect(result.missing).toContain("tuesday");
  });

  it("is unheard when nothing matched at all", () => {
    expect(markSequence(DAYS, [], "").verdict).toBe("unheard");
  });

  const TWOS = [2, 4, 6, 8, 10].map((n) => ({ id: String(n), spoken: [String(n)] }));

  it("fails a list that counts by ones through a count in twos, though every item was said", () => {
    const said = "1, 2, 3, 4, 5, 6, 7, 8, 9, 10";
    const { verdict } = markSequence(TWOS, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], said);
    expect(verdict).toBe("wrong");
  });

  it("fails a list with a number in it that is no item, and one said only wrong numbers", () => {
    expect(markSequence(TWOS, ["2", "4", "7", "6", "8", "10"], "2 4 7 6 8 10").verdict).toBe("wrong");
    expect(markSequence(TWOS, ["3", "5"], "3 5").verdict).toBe("wrong");
  });

  it("fails a list with an item said twice", () => {
    expect(markSequence(DAYS, ["monday", "monday", "tuesday"], "monday monday tuesday").verdict).toBe("wrong");
  });

  it("still passes a list where the model reported a filler word that is no number", () => {
    expect(markSequence(TWOS, ["um", "2", "then", "4", "6", "8", "10"], "um 2 then 4 6 8 10").verdict).toBe("correct");
  });
});
