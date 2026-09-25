import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LessonEditingStep } from "./LessonEditingStep";

afterEach(cleanup);

describe("a numbered step of editing a lesson", () => {
  /// The wiring this exists for: the section takes its name from the heading,
  /// and the two ids were written out by hand in five places.
  it("names its section with its own heading", () => {
    render(
      <LessonEditingStep
        step={2}
        id="lesson-goals"
        title="Learning goals"
        description="Keep each goal observable and specific."
        hidden={false}
      >
        <p>fields</p>
      </LessonEditingStep>,
    );

    const section = screen.getByRole("region", { name: "Learning goals" });
    expect(section).toBeVisible();
    expect(section).toContainElement(screen.getByText("fields"));
    expect(screen.getByRole("heading", { name: "Learning goals" })).toBeVisible();
  });

  /// Hidden rather than absent: a teacher reading and a teacher editing look at
  /// the same document, so the fields keep their place instead of reflowing it.
  it("stays in the document while a teacher is reading", () => {
    const { container } = render(
      <LessonEditingStep
        step={1}
        id="lesson-overview"
        title="Lesson overview"
        description="Set the title and the instructional materials you will need."
        hidden
      >
        <p>fields</p>
      </LessonEditingStep>,
    );

    expect(screen.queryByRole("region", { name: "Lesson overview" })).toBeNull();
    expect(container.querySelector("section[hidden]")).not.toBeNull();
    expect(container.textContent).toContain("fields");
  });
});
