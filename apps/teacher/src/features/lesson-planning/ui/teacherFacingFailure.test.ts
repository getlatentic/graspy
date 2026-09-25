import { describe, expect, it } from "vitest";

import { teacherFacingFailure } from "./useLessonPreparation";

describe("teacherFacingFailure", () => {
  it("hides the runtime's model-facing failure text from teachers", () => {
    const raw =
      "objectiveKnowledge is missing entries for lesson objectives 1, 2. " +
      "Keep every existing objectiveKnowledge entry and add one entry for each missing objective.";
    const shown = teacherFacingFailure(raw);
    expect(shown).not.toMatch(/objectiveKnowledge|Sequence/i);
    expect(shown.length).toBeGreaterThan(0);
  });

  it("passes a plain teacher-facing message through unchanged", () => {
    const raw =
      "There is nothing in your curriculum for graspy to teach “Estimate distances” from. " +
      "Choose a different learning goal for this lesson, or write this one yourself from its topic and goals.";
    expect(teacherFacingFailure(raw)).toBe(raw);
  });

  it("names the empty case rather than showing nothing", () => {
    expect(teacherFacingFailure("")).toMatch(/prepared|try again/i);
  });
});
