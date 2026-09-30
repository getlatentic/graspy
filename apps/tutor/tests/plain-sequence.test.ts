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

  it("does not drop 'okay', 'and' or 'er' from an alphabet, where a recogniser writes them for K, N and R", () => {
    expect(heardSequence(letters, "a, b, okay")).toBeNull();
    expect(heardSequence(letters, "a and b")).toBeNull();
    expect(heardSequence(letters, "a, b, um, then c")).toEqual(["a", "b", "c"]);
  });

  it("reads a single digit with a leading zero as the digit, as the recogniser writes 'five' in a run of numbers", () => {
    expect(heardSequence(fives, "05, 10, 15")).toEqual(["5", "10", "15"]);
    expect(heardSequence(fives, "5 10 15 20 25")).toEqual(["5", "10", "15", "20", "25"]);
  });

  it("reads a run of digits that is exactly the list, as a recogniser writes a count it has joined up", () => {
    expect(heardSequence(fives, "0510152025303540455055 60")).toHaveLength(12);
    expect(heardSequence(fives, "0510 1520 25 30 3540 4550 5560")).toEqual(["5", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55", "60"]);
    const first = [5, 10, 15, 20, 25].map((n) => ({ id: String(n), spoken: [String(n), "x"] }));
    expect(heardSequence(first, "0510 2025")).toBeNull();
    expect(heardSequence(first, "0510 152025")).toEqual(["5", "10", "15", "20", "25"]);
  });

  it("does not read a run of digits that is not exactly the list", () => {
    const first = [5, 10, 15, 20, 25].map((n) => ({ id: String(n), spoken: [String(n)] }));
    expect(heardSequence(first, "05101520")).toBeNull();
    expect(heardSequence(first, "051015202530")).toBeNull();
    expect(heardSequence(first, "0510 15 2026")).toBeNull();
  });

  it("is nothing heard for an empty recording", () => {
    expect(heardSequence(fives, "")).toEqual([]);
    expect(heardSequence(fives, null)).toEqual([]);
  });

  it.each(["1235", "0510", "0510152025", "005, 10", "0714", "five apples", "cinq dix", "5, 10, fiftteen", "márùn-ún ten"])("declines %s, which is not plain", (said) => {
    expect(heardSequence(fives, said)).toBeNull();
  });
});
