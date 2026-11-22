import { describe, expect, it } from "vitest";
import { cueForAnswerCall, cueForDecision } from "./answer-cue";

describe("the cue for an answer", () => {
  it.each(["answer_check", "answer_practice"])(
    "grades %s by the chosen option",
    (name) => {
      expect(cueForAnswerCall(name, { chosenIndex: 2, answerIndex: 2 })).toBe(
        "correct",
      );
      expect(cueForAnswerCall(name, { chosenIndex: 0, answerIndex: 2 })).toBe(
        "wrong",
      );
    },
  );

  it("is none for another tool or arguments that do not say", () => {
    expect(
      cueForAnswerCall("finish_lesson", { chosenIndex: 1, answerIndex: 1 }),
    ).toBeNull();
    expect(cueForAnswerCall("answer_check", { chosenIndex: "1" })).toBeNull();
  });

  it("gives a spoken answer's decision its cue, and none to what was not understood", () => {
    expect(cueForDecision("correct")).toBe("correct");
    expect(cueForDecision("try_again")).toBe("wrong");
    expect(cueForDecision("not_understood")).toBeNull();
  });
});
