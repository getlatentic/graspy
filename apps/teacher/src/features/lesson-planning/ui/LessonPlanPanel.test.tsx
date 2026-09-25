import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LessonPlanPanel } from "./LessonDetail";
import type { LessonDraft } from "../domain/lessonPlanning";

function lesson(overrides: Partial<LessonDraft> = {}): LessonDraft {
  return {
    id: "lesson",
    inputMode: "structured",
    topic: "Adding fractions",
    subtopic: null,
    rawPlan: null,
    learningGoals: ["Add fractions with the same denominator."],
    steps: [],
    instructionalMaterials: ["Fraction wall"],
    previousKnowledge: ["Learners can name equal parts of one whole."],
    assessment: [],
    assignment: ["Exercise 7c, questions 1 to 6."],
    references: [],
    ...overrides,
  } as unknown as LessonDraft;
}

describe("the lesson as a teacher reads it back", () => {
  /// "Materials" already means the chalk and charts a teacher carries in, on
  /// the plan their school reads. The screen says the same words as the paper,
  /// so nothing has to be translated between them.
  it("names every section as the lesson plan names it", () => {
    render(<LessonPlanPanel lesson={lesson()} />);

    expect(screen.getByRole("heading", { name: "Instructional materials" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Previous knowledge" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Assignment" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Materials" })).toBeNull();
  });

  it("says what the class already knows and what is set to take home", () => {
    render(<LessonPlanPanel lesson={lesson()} />);

    expect(screen.getByText("Learners can name equal parts of one whole.")).toBeVisible();
    expect(screen.getByText("Exercise 7c, questions 1 to 6.")).toBeVisible();
  });

  it("leaves out a section the lesson does not carry", () => {
    render(<LessonPlanPanel lesson={lesson({ previousKnowledge: [], assignment: [] })} />);

    expect(screen.queryByRole("heading", { name: "Previous knowledge" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Assignment" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Instructional materials" })).toBeVisible();
  });
});
