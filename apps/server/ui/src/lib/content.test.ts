import { describe, expect, it } from "vitest";
import contract from "./card-contract.json";
import {
  isPassageSet,
  isPracticeSet,
  practiceAnswer,
  type PracticeSet,
} from "./content";

const PRACTICE = "ui://graspy/practice";
const PASSAGE = "ui://graspy/passage";

describe("the server's cards", () => {
  it("are what each view shows", () => {
    expect(isPracticeSet(contract.content[PRACTICE])).toBe(true);
    expect(isPassageSet(contract.content[PASSAGE])).toBe(true);
  });

  it("are answered with the arguments the server reads", () => {
    const set = contract.content[PRACTICE] as PracticeSet;
    const { arguments: expected } = contract.answer;

    expect(
      practiceAnswer(
        set.questions[0],
        expected.chosenIndex,
        contract.meta.where,
        `${contract.meta.viewUUID}:0`,
      ),
    ).toEqual(expected);
  });

  it("are refused when a passage has nothing to read", () => {
    expect(isPassageSet({ ...contract.content[PASSAGE], passage: " " })).toBe(
      false,
    );
  });
});

const QUESTION = {
  question: "Convert 13/40 to a decimal.",
  options: ["0.325", "0.35", "3.25"],
  answerIndex: 0,
  correctFeedback: "13 ÷ 40 = 0.325.",
  incorrectFeedback: "Divide the top by the bottom.",
  hint: "",
};

const setOf = (...questions: object[]) => ({ instruction: "", questions });

describe("a practice set", () => {
  it("accepts a question the card can show", () => {
    expect(isPracticeSet(setOf(QUESTION))).toBe(true);
  });

  it.each([
    ["one option", { options: ["0.325"] }],
    ["an answer past the options", { answerIndex: 3 }],
    ["a negative answer", { answerIndex: -1 }],
    ["an answer that is not a whole number", { answerIndex: 0.5 }],
    ["options that are not text", { options: [1, 2, 3] }],
    ["no feedback", { correctFeedback: undefined }],
  ])("rejects %s, which the card cannot mark", (_, change) => {
    expect(isPracticeSet(setOf({ ...QUESTION, ...change }))).toBe(false);
  });

  it("takes one to five questions", () => {
    const setOfCount = (count: number) => setOf(...Array(count).fill(QUESTION));
    expect(isPracticeSet(setOfCount(0))).toBe(false);
    expect(isPracticeSet(setOfCount(5))).toBe(true);
    expect(isPracticeSet(setOfCount(6))).toBe(false);
  });
});
