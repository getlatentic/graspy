import { describe, expect, it } from "vitest";
import { numbersHeard, saidNumber } from "../src/read";

describe("the numbers a child said", () => {
  it("reads them from words, digits and a mix of both", () => {
    expect(numbersHeard("three times three na nine")).toEqual([3, 3, 9]);
    expect(numbersHeard("3 x 4 now 12, 12")).toEqual([3, 4, 12, 12]);
    expect(numbersHeard("twenty one")).toEqual([21]);
    expect(numbersHeard("nine, no, eight")).toEqual([9, 8]);
  });

  it("reads a three-digit answer whether or not the child says and", () => {
    expect(numbersHeard("one hundred and forty four")).toEqual([144]);
    expect(numbersHeard("one hundred forty four")).toEqual([144]);
    expect(numbersHeard("a hundred and twenty")).toEqual([120]);
  });

  it("keeps numbers apart across punctuation of any script", () => {
    expect(numbersHeard("mẹ́sàn-án! nine?")).toEqual([9]);
    expect(numbersHeard("six… seven")).toEqual([6, 7]);
  });

  it("hears no number in words that carry none", () => {
    expect(numbersHeard("i don't know")).toEqual([]);
    expect(numbersHeard("   ")).toEqual([]);
  });
});

describe("a number only stands when the child said it", () => {
  it("accepts one the child said, in digits or in words", () => {
    expect(saidNumber("three times three is nine", 9)).toBe(9);
    expect(saidNumber("the answer is 56", 56)).toBe(56);
    expect(saidNumber("twelve times twelve is one hundred and forty four", 144)).toBe(144);
  });

  it("refuses one the child never said", () => {
    expect(saidNumber("three times three is", 9)).toBeNull();
    expect(saidNumber("nineteen", 9)).toBeNull();
  });

  it("refuses a reading that is not a whole number a child could answer", () => {
    expect(saidNumber("nine", null)).toBeNull();
    expect(saidNumber("nine point five", 9.5)).toBeNull();
    expect(saidNumber("one thousand", 1000)).toBeNull();
    expect(saidNumber("minus nine", -9)).toBeNull();
  });
});
