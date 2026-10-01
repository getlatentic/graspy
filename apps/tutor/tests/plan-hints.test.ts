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
