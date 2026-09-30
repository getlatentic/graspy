import { afterEach, describe, expect, it, vi } from "vitest";
import { CRITERIA, judgedOrNull, judgeMessages, parseJudgement } from "./judge.ts";

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

describe("judgedOrNull", () => {
  const reply = (content: string) => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) }) as Response;
  afterEach(() => vi.restoreAllMocks());

  it("asks again when the reply is not JSON, as the run's transcript must never be lost to it", async () => {
    const fetched = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(reply('{"summary": "x", "scores": [{"criterion": "pacing", "score": inseno de "y"}]}'))
      .mockResolvedValueOnce(reply('{"summary": "Good.", "scores": [{"criterion": "pacing", "score": 4, "evidence": "short"}]}'));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const judgement = await judgedOrNull("key", "transcript");

    expect(fetched).toHaveBeenCalledTimes(2);
    expect(judgement?.scores).toEqual([{ criterion: "pacing", score: 4, evidence: "short" }]);
  });

  it("gives null, and does not throw, when the judge cannot be read twice", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(reply("no json at all"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(judgedOrNull("key", "transcript")).resolves.toBeNull();
  });
});
