import { describe, expect, it } from "vitest";
import { meanFidelity, transcriptMarkdown } from "./report.ts";
import type { Run } from "./turn-log.ts";

const run: Run = {
  id: "r", persona: "unsure", language: "en", learnerClass: "primary_4", plan: "table-7",
  startedAt: "2026-09-29T10:00:00Z", finished: "rest",
  turns: [
    {
      index: 1,
      move: { kind: "event", planId: "table-7", eventId: "assess", event: "assess_performance", says: "What is seven times eight?", shows: "7 × 8", asksForAnswer: true, reason: null },
      child: { said: "fifty five", isRight: false, note: "off by one" },
      marking: { heard: "fifty five", parsedAnswer: 55, decision: "try_again", feedback: "Nearly. Count in sevens.", provider: "intron", latencyMs: 800 },
      replyWaitMs: 1200,
      pageNote: null,
      screenshots: ["shots/01-result.png"],
    },
  ],
};

describe("transcriptMarkdown", () => {
  const text = transcriptMarkdown(run, [], null);

  it("gives each turn's teacher line, the child's intent, hearing and marking", () => {
    expect(text).toContain("**Teacher:** What is seven times eight?");
    expect(text).toContain('**Child, meaning to say:** "fifty five" (wrong)');
    expect(text).toContain('**Recogniser heard:** "fifty five" → 55');
    expect(text).toContain('**Teacher marks:** try_again: "Nearly. Count in sevens."');
    expect(text).toContain("![turn 1](shots/01-result.png)");
  });

  it("says when there are no findings and no judgement", () => {
    expect(text).toContain("None.");
    expect(text).toContain("Not run.");
  });
});

describe("meanFidelity", () => {
  it("is 1 for a faithfully heard answer and null with nothing said", () => {
    expect(meanFidelity(run)).toBe(1);
    expect(meanFidelity({ ...run, turns: [] })).toBeNull();
  });
});
