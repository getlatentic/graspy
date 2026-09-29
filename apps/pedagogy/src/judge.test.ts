import { describe, expect, it } from "vitest";
import { CRITERIA, judgeMessages, parseJudgement } from "./judge.ts";

describe("parseJudgement", () => {
  it("keeps scores for known criteria within 1 to 5", () => {
    const reply = JSON.stringify({
      summary: "Good.",
      scores: [
        { criterion: "pacing", score: 4, evidence: "short lines" },
        { criterion: "made-up", score: 3, evidence: "" },
        { criterion: "feedback", score: 9, evidence: "" },
      ],
    });
    expect(parseJudgement(`Here: ${reply}`)).toEqual({
      summary: "Good.",
      scores: [{ criterion: "pacing", score: 4, evidence: "short lines" }],
    });
  });

  it("refuses a reply with no JSON", () => {
    expect(() => parseJudgement("fine")).toThrow(/no JSON/);
  });
});

describe("judgeMessages", () => {
  it("lists every criterion and sends the transcript last", () => {
    const [system, user] = judgeMessages("TRANSCRIPT");
    for (const name of Object.keys(CRITERIA)) expect(system.content).toContain(name);
    expect(user.content).toBe("TRANSCRIPT");
  });
});
