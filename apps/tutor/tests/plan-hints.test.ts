import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lineProblems } from "../src/guard";

const PLANS = new URL("../../server/src/app/voice/lesson_plans/plans/", import.meta.url).pathname;

function planFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? planFiles(path) : path.endsWith(".json") ? [path] : [];
  });
}

interface Event { id: string; activity?: { kind: string; hints?: Record<string, string[]> } }

const hinted = planFiles(PLANS).flatMap((file) => {
  const plan = JSON.parse(readFileSync(file, "utf8")) as { id: string; events: Event[] };
  return plan.events.flatMap((event) => (event.activity?.hints ? [{ where: `${plan.id}#${event.id}`, event }] : []));
});

describe("the hints a plan gives for a wrong answer", () => {
  it("exist for the applied lessons", () => {
    expect(hinted.length).toBeGreaterThanOrEqual(7);
  });

  it("are lines a child may hear, every one, as the teacher's own lines are checked", () => {
    for (const { where, event } of hinted) {
      for (const [language, lines] of Object.entries(event.activity!.hints!)) {
        for (const line of lines) expect(lineProblems(line), `${where} ${language}: ${line}`).toEqual([]);
      }
    }
  });
});

describe("what a hint may say", () => {
  const withAnswers = planFiles(PLANS).flatMap((file) => {
    const plan = JSON.parse(readFileSync(file, "utf8")) as { id: string; events: { id: string; activity?: { kind: string; expected?: Record<string, string[]>; hints?: Record<string, string[]> } }[] };
    return plan.events.flatMap((event) =>
      event.activity?.hints && event.activity.expected ? [{ where: `${plan.id}#${event.id}`, answers: event.activity.expected.en, hints: event.activity.hints.en }] : [],
    );
  });

  it("never gives the answer to the question it is a hint for", () => {
    for (const { where, answers, hints } of withAnswers) {
      for (const hint of hints) {
        for (const answer of answers.filter((one) => /[a-z]/i.test(one))) {
          expect(hint.toLowerCase(), `${where}: "${hint}" gives "${answer}"`).not.toMatch(new RegExp(`\\b${answer.replace(/-/g, "[- ]")}\\b`));
        }
      }
    }
    expect(withAnswers.length).toBeGreaterThanOrEqual(7);
  });
});

describe("how much each hint gives away", () => {
  const NUMBER = /\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b/gi;
  const ladders = planFiles(PLANS).flatMap((file) => {
    const plan = JSON.parse(readFileSync(file, "utf8")) as { id: string; events: { id: string; activity?: { hints?: Record<string, string[]>; hint_levels?: string[] } }[] };
    return plan.events.flatMap((event) =>
      event.activity?.hints ? [{ where: `${plan.id}#${event.id}`, hints: event.activity.hints.en, levels: event.activity.hint_levels ?? [] }] : [],
    );
  });

  it("is said for every hint", () => {
    for (const { where, hints, levels } of ladders) expect(levels.length, where).toBe(hints.length);
  });

  it("lets a cue name at most one number, and the first hint never say part of the answer", () => {
    for (const { where, hints, levels } of ladders) {
      expect(levels[0], where).not.toBe("partial_model");
      hints.forEach((hint, at) => {
        if (levels[at] === "cue") expect(hint.match(NUMBER)?.length ?? 0, `${where}: ${hint}`).toBeLessThanOrEqual(1);
      });
    }
  });
});
