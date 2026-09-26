import { describe, expect, it } from "vitest";
import { expectedAnswer, markAnswer, sameAnswer, spokenNumber } from "../src/mark";

describe("what an item asks for", () => {
  it("works out a times-table fact rather than being told it", () => {
    expect(expectedAnswer("7x8")).toBe("56");
    expect(expectedAnswer("2 × 4")).toBe("8");
  });

  it("takes a word item as its own answer", () => {
    expect(expectedAnswer("Ball")).toBe("ball");
  });
});

describe("reading a number a child spoke", () => {
  it("takes the words as readily as the digits", () => {
    expect(spokenNumber("eight")).toBe(8);
    expect(spokenNumber("fifty-six")).toBe(56);
    expect(spokenNumber("fifty six")).toBe(56);
    expect(spokenNumber("one hundred and forty four")).toBe(144);
    expect(spokenNumber("8")).toBe(8);
  });

  it("is not a number when the words are not one", () => {
    expect(spokenNumber("ball")).toBeNull();
    expect(spokenNumber("")).toBeNull();
  });
});

describe("comparing what was said", () => {
  it("reads numbers as numbers, so a leading zero does not fail a child", () => {
    expect(sameAnswer("08", "8")).toBe(true);
  });

  it("passes a child who says the number in words", () => {
    expect(sameAnswer("eight", "8")).toBe(true);
    expect(sameAnswer("fifty-six", "56")).toBe(true);
  });

  it("ignores case and spacing in words", () => {
    expect(sameAnswer("  Ball ", "ball")).toBe(true);
  });
});

describe("marking one spoken answer", () => {
  it("passes an answer that matches, spoken or written", () => {
    expect(markAnswer("2x4", "8").verdict).toBe("correct");
    expect(markAnswer("2x4", "eight").verdict).toBe("correct");
    expect(markAnswer("7x8", "fifty six").verdict).toBe("correct");
  });

  it("fails an answer that does not", () => {
    expect(markAnswer("2x4", "7").verdict).toBe("wrong");
    expect(markAnswer("2x4", "seven").verdict).toBe("wrong");
  });

  it("does not read a word answer as a number it never was", () => {
    expect(markAnswer("ball", "ball").verdict).toBe("correct");
    expect(markAnswer("ball", "bat").verdict).toBe("wrong");
  });

  it("treats silence as unheard, never as a mistake", () => {
    expect(markAnswer("2x4", null).verdict).toBe("unheard");
    expect(markAnswer("2x4", "   ").verdict).toBe("unheard");
  });

  it("treats a reading the model would not stand behind as unheard", () => {
    expect(markAnswer("2x4", "eight", false).verdict).toBe("unheard");
  });

  it("tells the caller the right answer whatever the verdict", () => {
    expect(markAnswer("2x4", null).expected).toBe("8");
    expect(markAnswer("2x4", "7").expected).toBe("8");
  });
});

describe("a reading that is not an answer at all", () => {
  it("is unheard when a number was asked for and none came back", () => {
    expect(markAnswer("2x4", "Aid").verdict).toBe("unheard");
    expect(markAnswer("2x4", "I don't know").verdict).toBe("unheard");
  });

  it("still fails a real number that is the wrong one", () => {
    expect(markAnswer("2x4", "seven").verdict).toBe("wrong");
  });

  it("does not apply where the answer was never a number", () => {
    expect(markAnswer("ball", "bat").verdict).toBe("wrong");
  });
});
