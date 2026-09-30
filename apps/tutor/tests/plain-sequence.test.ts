import { describe, expect, it } from "vitest";
import { heardSequence } from "../src/plain-sequence";

const fives = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map((n) => ({
  id: String(n),
  spoken: [String(n), ...[
    { 5: "five", 10: "ten", 15: "fifteen", 20: "twenty", 25: "twenty-five", 30: "thirty", 35: "thirty-five", 40: "forty", 45: "forty-five", 50: "fifty", 55: "fifty-five", 60: "sixty" }[n] as string,
  ]],
}));
const letters = [["a", "ay"], ["b", "bee"], ["c", "see"]].map(([id, say]) => ({ id, spoken: [id, say] }));

describe("heardSequence", () => {
  it("reads digits, words and compound numbers, in the order said", () => {
    expect(heardSequence(fives, "5, 10, 15, 20")).toEqual(["5", "10", "15", "20"]);
    expect(heardSequence(fives, "five ten fifteen twenty")).toEqual(["five", "ten", "fifteen", "twenty"]);
    expect(heardSequence(fives, "twenty five, thirty, thirty-five")).toEqual(["twenty five", "thirty", "thirty five"]);
  });

  it("keeps twenty and five apart when the child paused between them", () => {
    expect(heardSequence(fives, "twenty, five")).toEqual(["twenty", "five"]);
    expect(heardSequence(fives, "twenty five")).toEqual(["twenty five"]);
  });

  it("lets fillers through", () => {
    expect(heardSequence(fives, "um, five and ten, then fifteen")).toEqual(["five", "ten", "fifteen"]);
  });

  it("reads the alphabet as it is spelled or spoken", () => {
    expect(heardSequence(letters, "A, B, C")).toEqual(["a", "b", "c"]);
    expect(heardSequence(letters, "ay bee see")).toEqual(["ay", "bee", "see"]);
  });

  it("declines a number that is not an item, which is a child counting by ones or saying a wrong number", () => {
    expect(heardSequence(fives, "5, 10, 15, 21")).toBeNull();
    expect(heardSequence(fives, "5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 65")).toBeNull();
    expect(heardSequence(fives, "1, 2, 3, 4, 5, 6, 7, 8, 9, 10")).toBeNull();
    expect(heardSequence(letters, "a, b, 7")).toBeNull();
  });

  it("declines an item said twice", () => {
    expect(heardSequence(fives, "5, 10, 10, 15")).toBeNull();
    expect(heardSequence(letters, "a, b, a")).toBeNull();
  });

  it("declines a number that runs on across a comma or an 'and'", () => {
    const tens = [100, 110, 120, 10].map((k) => ({ id: String(k), spoken: [String(k)] }));
    expect(heardSequence(tens, "100, and 10, 120")).toBeNull();
    expect(heardSequence(tens, "100 and 10, 120")).toBeNull();
    expect(heardSequence(tens, "100, 110, 120")).toEqual(["100", "110", "120"]);
  });

  it("is nothing heard for an empty recording", () => {
    expect(heardSequence(fives, "")).toEqual([]);
    expect(heardSequence(fives, null)).toEqual([]);
  });

  it.each(["1235", "05, 10", "0510152025", "five apples", "cinq dix", "5, 10, fiftteen", "márùn-ún ten"])("declines %s, which is not plain", (said) => {
    expect(heardSequence(fives, said)).toBeNull();
  });
});
