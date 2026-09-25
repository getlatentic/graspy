import { describe, expect, it } from "vitest";
import type { PracticeQuestion } from "@/lib/content";
import {
  askAnotherPassage,
  askAnotherPractice,
  askExplain,
  scoreOf,
} from "./asks";
import { wordsFor } from "./words";

const words = wordsFor("en").practice;
const question = (text: string, answerIndex: number): PracticeQuestion => ({
  question: text,
  options: ["0.25", "0.4"],
  answerIndex,
  correctFeedback: "",
  incorrectFeedback: "",
  hint: "",
});
const one = [question("1/4 as a decimal?", 0)];
const two = [question("1/4?", 0), question("2/5?", 1)];

describe("what the learner says", () => {
  it("scores the questions answered right", () => {
    expect(scoreOf(two, { 0: 0, 1: 0 })).toEqual({
      right: 1,
      total: 2,
      chosen: { 0: 0, 1: 0 },
    });
  });

  it("asks why one question's answer is what it is", () => {
    expect(askExplain(one, { 0: 1 }, words)).toBe(
      "I chose 0.4, but the answer is 0.25. Explain why, step by step.",
    );
  });

  it("asks about only the questions of a set it got wrong", () => {
    expect(askExplain(two, { 0: 0, 1: 0 }, words)).toBe(
      [
        "Explain the ones I got wrong, step by step:",
        "2/5?: I chose 0.25, but the answer is 0.4.",
      ].join("\n"),
    );
  });

  it("asks for more practice from how the last went", () => {
    expect(askAnotherPractice(one, scoreOf(one, { 0: 0 }), words)).toBe(
      words.askAnotherRight,
    );
    expect(askAnotherPractice(one, scoreOf(one, { 0: 1 }), words)).toBe(
      "I chose 0.4 and got it wrong. Give me another question like it.",
    );
    expect(askAnotherPractice(two, scoreOf(two, { 0: 0, 1: 1 }), words)).toBe(
      "I got 2 of 2 right. Give me another set like it.",
    );
  });

  it("asks for another passage with the score", () => {
    expect(
      askAnotherPassage(scoreOf(two, { 0: 1, 1: 1 }), wordsFor("en")),
    ).toBe("I got 1 of 2 right on the passage. Give me another one to read.");
  });
});
