import { describe, expect, it } from "vitest";

import { draftRequestOf, type DraftTarget, type EditedDraft } from "./lessonDraftRequest";
import type { SaveLessonDraftRequest } from "./lessonPlanning";

const edited: EditedDraft = {
  topic: "Fractions",
  subtopic: "Equivalent fractions",
  rawPlan: "Week 3. Compare halves and quarters.",
  learningGoals: "Compare two fractions.\nExplain why they are equal.",
  instructionalMaterials: "Fraction wall",
  previousKnowledge: "Learners can name equal parts of one whole.",
  assessment: "Exit problem",
  assignment: "Exercise 5, questions 1 to 4.",
  references: "School mathematics text, chapter 4",
};

const steps: SaveLessonDraftRequest["steps"] = [
  {
    title: "Model with a fraction wall",
    teacherActivity: "Show two halves against four quarters.",
    learnerActivity: "Name an equal pair.",
    durationMinutes: 15,
  },
];

const target = (inputMode: DraftTarget["inputMode"]): DraftTarget => ({
  lessonId: "lesson",
  schemeWeekId: "week",
  schemeEntryId: "entry",
  inputMode,
});

describe("what a save from the editor asks for", () => {
  it("keeps a structured lesson's fields and no raw text", () => {
    const request = draftRequestOf(target("structured"), edited, steps);
    expect(request.rawPlan).toBeNull();
    expect(request.learningGoals).toEqual([
      "Compare two fractions.",
      "Explain why they are equal.",
    ]);
    expect(request.steps).toEqual(steps);
    expect(request.instructionalMaterials).toEqual(["Fraction wall"]);
    expect(request.previousKnowledge).toEqual(["Learners can name equal parts of one whole."]);
    expect(request.assessment).toEqual(["Exit problem"]);
    expect(request.assignment).toEqual(["Exercise 5, questions 1 to 4."]);
    expect(request.references).toEqual(["School mathematics text, chapter 4"]);
  });

  it("keeps a pasted plan's own words and nothing structured", () => {
    const request = draftRequestOf(target("pasted"), edited, steps);
    expect(request.rawPlan).toBe("Week 3. Compare halves and quarters.");
    expect(request.learningGoals).toEqual([]);
    expect(request.steps).toEqual([]);
    expect(request.instructionalMaterials).toEqual([]);
    expect(request.previousKnowledge).toEqual([]);
    expect(request.assessment).toEqual([]);
    expect(request.assignment).toEqual([]);
    expect(request.references).toEqual([]);
  });

  it("carries the topic and where the lesson belongs, whichever way it was written", () => {
    for (const mode of ["structured", "pasted"] as const) {
      const request = draftRequestOf(target(mode), edited, steps);
      expect(request.topic).toBe("Fractions");
      expect(request.lessonId).toBe("lesson");
      expect(request.schemeWeekId).toBe("week");
      expect(request.schemeEntryId).toBe("entry");
    }
  });

  it("treats a subtopic of only spaces as no subtopic", () => {
    const request = draftRequestOf(target("structured"), { ...edited, subtopic: "   " }, steps);
    expect(request.subtopic).toBeNull();
  });
});
