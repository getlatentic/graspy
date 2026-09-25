import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { emptyEditableStep } from "./lessonStepDraft";
import { StructuredLessonFields } from "./StructuredLessonFields";

function fields(overrides: { instructionalMaterials?: string; assessment?: string } = {}) {
  return (
    <StructuredLessonFields
      learningGoals="Count in millions."
      instructionalMaterials={overrides.instructionalMaterials ?? ""}
      previousKnowledge=""
      assessment={overrides.assessment ?? ""}
      assignment=""
      references=""
      steps={[emptyEditableStep()]}
      onLearningGoalsChange={vi.fn()}
      onInstructionalMaterialsChange={vi.fn()}
      onPreviousKnowledgeChange={vi.fn()}
      onAssessmentChange={vi.fn()}
      onAssignmentChange={vi.fn()}
      onReferencesChange={vi.fn()}
      onStepsChange={vi.fn()}
    />
  );
}

const HINT = "graspy will write these for you";

describe("the parts of a lesson a teacher may write themselves", () => {
  it("offers to write an empty part", () => {
    render(fields());
    expect(screen.getAllByText(HINT)).toHaveLength(2);
  });

  /// Shown over a section already open and already filled from a weekly plan,
  /// this said the opposite of what the screen showed.
  it("does not claim to write a part that is already filled in", () => {
    render(fields({ instructionalMaterials: "Place value chart", assessment: "Read a number aloud" }));
    // Teaching steps is still empty and still offers; the filled one does not.
    expect(screen.getAllByText(HINT)).toHaveLength(1);
  });

  /// It was written twice on screen: once as the section heading with its
  /// helper line, and again as the field's own label directly beneath. The
  /// heading is now the only one a teacher reads, while the field keeps the
  /// accessible name a screen reader needs.
  it("names the learning goals once on screen, and still names it to a screen reader", () => {
    render(fields());
    expect(screen.getByRole("heading", { name: "Learning goals" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Learning goals" })).toBeVisible();
    expect(document.querySelectorAll("label.cds--visually-hidden")).toHaveLength(1);
  });

  /// "Materials" means two different things: the chalk and charts a teacher
  /// carries in, and the worked examples graspy writes. This field is the first,
  /// and the lesson plan it is printed on calls it instructional materials.
  it("asks for every section a lesson plan carries, under the name on that paper", () => {
    render(fields({ instructionalMaterials: "Place value chart" }));
    for (const label of [
      "Instructional materials",
      "Previous knowledge",
      "Assessment",
      "Assignment",
    ]) {
      expect(screen.getByRole("textbox", { name: new RegExp(`^${label}`) })).toBeVisible();
    }
    expect(screen.queryByRole("textbox", { name: /^Materials/ })).toBeNull();
  });
});
