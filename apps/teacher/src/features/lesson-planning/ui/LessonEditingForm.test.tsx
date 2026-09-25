import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LessonEditingForm } from "./LessonEditingForm";
import type { GranularLessonRecord } from "../domain/granularLesson";

const plan = {
  topic: "Ordering fractions",
  subtopic: null,
  materials: [],
  lessonObjectives: [],
  knowledgeComponents: [],
  priorKnowledge: [],
  misconceptions: [],
  coreSteps: [],
  steps: [],
  assessments: [],
  curriculumObjectives: [],
  references: [],
} as unknown as GranularLessonRecord["plan"];

describe("the five steps a teacher fills in", () => {
  /// The numbers used to be written by hand beside each step, so a step could
  /// claim to be third while sitting second. They are its position now.
  it("numbers each step by where it sits", () => {
    render(
      <LessonEditingForm
        plan={plan}
        editing
        pending={false}
        sourceFigures={[]}
        changePlan={vi.fn()}
      />,
    );

    const badges = screen
      .getAllByRole("region")
      .map((section) => section.querySelector("span")?.textContent?.trim());
    expect(badges).toEqual(["1", "2", "3", "4", "5"]);
  });

  /// Every step stays mounted while a teacher is reading, so nothing typed is
  /// lost by looking away — hidden, not unmounted.
  it("keeps every step mounted while the lesson is only being read", () => {
    render(
      <LessonEditingForm
        plan={plan}
        editing={false}
        pending={false}
        sourceFigures={[]}
        changePlan={vi.fn()}
      />,
    );

    const sections = document.querySelectorAll("section[aria-labelledby$='-heading']");
    expect(sections).toHaveLength(5);
    expect([...sections].every((section) => section.hasAttribute("hidden"))).toBe(true);
  });
});
