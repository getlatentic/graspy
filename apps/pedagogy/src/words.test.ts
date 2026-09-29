import { describe, expect, it } from "vitest";
import { hearingFidelity, spokenNumbersAsDigits, wordsOf } from "./words.ts";

describe("wordsOf", () => {
  it("lowercases and drops punctuation but keeps tone-marked letters", () => {
    expect(wordsOf("Fifty-six, ọ̀kan!")).toEqual(["fifty-six", "ọ̀kan"]);
  });
});

describe("hearingFidelity", () => {
  it("is 1 when every intended word was heard in order", () => {
    expect(hearingFidelity("seven times eight", "Seven times eight.")).toBe(1);
  });

  it("counts the intended words that were missed", () => {
    expect(hearingFidelity("one two", "one")).toBe(0.5);
  });

  it("does not credit words heard out of order", () => {
    expect(hearingFidelity("one two", "two one")).toBe(0.5);
  });

  it("is 1 when the child meant to say nothing", () => {
    expect(hearingFidelity("", "anything")).toBe(1);
  });
});

describe("spokenNumbersAsDigits", () => {
  it("joins compound numbers and keeps separate ones apart", () => {
    expect(spokenNumbersAsDigits(wordsOf("fifty six"))).toEqual(["56"]);
    expect(spokenNumbersAsDigits(wordsOf("five ten fifteen twenty"))).toEqual(["5", "10", "15", "20"]);
    expect(spokenNumbersAsDigits(wordsOf("twenty five thirty thirty five"))).toEqual(["25", "30", "35"]);
    expect(spokenNumbersAsDigits(wordsOf("one hundred and five"))).toEqual(["105"]);
    expect(spokenNumbersAsDigits(wordsOf("fifty-six"))).toEqual(["56"]);
  });

  it("leaves other words alone", () => {
    expect(spokenNumbersAsDigits(wordsOf("seven times eight is fifty six"))).toEqual(["7", "times", "8", "is", "56"]);
  });

  it("makes a recogniser's digits match the child's words", () => {
    expect(hearingFidelity("one two three four five", "1, 2, 3, 4, 5")).toBe(1);
    expect(hearingFidelity("five ten fifteen twenty", "5, 10, 15, 20.")).toBe(1);
  });
});
