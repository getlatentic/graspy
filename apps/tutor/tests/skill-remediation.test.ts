import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lineProblems } from "../src/guard";

const SKILLS = new URL("../../server/src/app/voice/lesson_plans/skills.json", import.meta.url).pathname;

interface Step { say: Record<string, string>; expected: Record<string, string[]>; hints?: Record<string, string[]> }

const steps = (JSON.parse(readFileSync(SKILLS, "utf8")) as { skills: { id: string; remediation?: Step[] }[] }).skills.flatMap((skill) =>
  (skill.remediation ?? []).map((step, at) => ({ where: `${skill.id}#${at}`, step })),
);

describe("the small questions a skill is taught with", () => {
  it("exist", () => {
    expect(steps.length).toBeGreaterThanOrEqual(3);
  });

  it("are lines a child may hear, every question and every hint, as the teacher's own lines are checked", () => {
    for (const { where, step } of steps) {
      const lines = [...Object.values(step.say), ...Object.values(step.hints ?? {}).flat()];
      for (const line of lines) expect(lineProblems(line), `${where}: ${line}`).toEqual([]);
    }
  });

  it("never give the answer in a hint", () => {
    for (const { where, step } of steps) {
      for (const hint of step.hints?.en ?? []) {
        for (const answer of step.expected.en.filter((one) => /[a-z]/i.test(one))) {
          expect(hint.toLowerCase(), `${where}: "${hint}" gives "${answer}"`).not.toMatch(new RegExp(`\\b${answer}\\b`));
        }
      }
    }
  });
});
