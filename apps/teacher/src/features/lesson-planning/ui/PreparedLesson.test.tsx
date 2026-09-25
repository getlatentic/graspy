import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LessonContent } from "../domain/lessonContent";
import { PreparedLesson } from "./PreparedLesson";

function content(): LessonContent {
  return {
    objectives: ["Count in millions."],
    instructionalMaterials: ["Place-value chart"],
    steps: [
      {
        id: "step-1",
        title: "Count forward",
        durationMinutes: 15,
        summary: "Practise counting on the chart.",
        blocks: [{ type: "explanation", id: "block-1", content: "A million is a thousand thousands." }],
      },
    ],
    checks: [{ id: "check-1", question: "Write four million in digits.", expectedAnswer: "4,000,000" }],
  };
}

describe("PreparedLesson", () => {
  it("reads a lesson as goals, steps and checks from lesson content", () => {
    render(<PreparedLesson content={content()} />);

    expect(screen.getByText("What learners will be able to do")).toBeVisible();
    expect(screen.getByText("Count in millions.")).toBeVisible();
    expect(screen.getByText("What to bring")).toBeVisible();
    expect(screen.getByText("Place-value chart")).toBeVisible();
    expect(screen.getByText("Count forward")).toBeVisible();
    expect(screen.getByText("15 min")).toBeVisible();
    expect(screen.getByText("Homework")).toBeVisible();
  });

  it("shows the step without a duration when it has none, rather than 'null min'", () => {
    const draft = content();
    draft.steps[0].durationMinutes = null;
    render(<PreparedLesson content={draft} />);

    expect(screen.getByText("Count forward")).toBeVisible();
    expect(screen.queryByText(/min/)).toBeNull();
  });
});
