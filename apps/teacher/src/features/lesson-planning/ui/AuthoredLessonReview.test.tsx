import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import type { LessonContent } from "../domain/lessonContent";
import type { LessonDraft } from "../domain/lessonPlanning";
import { AuthoredLessonReview } from "./AuthoredLessonReview";

// The host reads only a handful of fields off each; the rest are irrelevant here.
const academicContext = {
  assignment: { displayName: "Mathematics · JSS 1" },
  sessionLabel: "2025/2026",
  period: { name: "First term" },
} as unknown as ActiveAcademicContext;

const lesson = {
  id: "lesson-1",
  topic: "Whole Numbers",
  subtopic: "Millions",
  schemeWeekId: null,
  schemeEntryId: null, classworkComplete: false,
  curriculumUnit: null,
} as unknown as LessonDraft;

function content(): LessonContent {
  return {
    objectives: ["Count in millions."],
    instructionalMaterials: [],
    steps: [{ id: "step-1", title: "Count forward", durationMinutes: 15, summary: "", blocks: [] }],
    checks: [],
  };
}

describe("AuthoredLessonReview", () => {
  it("opens as the lesson read, and editing is a deliberate step into the same layout", async () => {
    const user = userEvent.setup();
    render(
      <AuthoredLessonReview
        academicContext={academicContext}
        lesson={lesson}
        content={content()}
        saving={false}
        error={null}
        onBack={vi.fn()}
        onSave={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(screen.getByText("What learners will be able to do")).toBeVisible();
    expect(screen.getByText("Count in millions.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Edit lesson" }));

    expect(screen.getByRole("button", { name: "Add goal" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeVisible();
  });

  it("makes the topic inline-editable and saves the edited topic and content", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    render(
      <AuthoredLessonReview
        academicContext={academicContext}
        lesson={lesson}
        content={content()}
        saving={false}
        error={null}
        onBack={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit lesson" }));

    const topicInput = screen.getByLabelText("Lesson topic");
    expect(topicInput).toHaveValue("Whole Numbers");
    await user.type(topicInput, " and hundreds");
    await user.type(screen.getByLabelText("Learning goal 1"), "!");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [topic, saved] = onSave.mock.calls[0] as [string, LessonContent];
    expect(topic).toBe("Whole Numbers and hundreds");
    expect(saved.objectives[0]).toBe("Count in millions.!");
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit lesson" })).toBeVisible();
  });
});
