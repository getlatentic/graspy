import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import type { LessonContent } from "../domain/lessonContent";
import { NewAuthoredLesson } from "./NewAuthoredLesson";

const academicContext = {
  assignment: { displayName: "Mathematics · JSS 1" },
  sessionLabel: "2025/2026",
  period: { name: "First term" },
} as unknown as ActiveAcademicContext;

describe("NewAuthoredLesson", () => {
  it("cannot be saved until the lesson is named, then saves the topic and content", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    render(
      <NewAuthoredLesson
        academicContext={academicContext}
        pending={false}
        error={null}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();

    await user.type(screen.getByLabelText("Lesson topic"), "Whole Numbers");
    await user.click(screen.getByRole("button", { name: "Add goal" }));
    await user.type(screen.getByLabelText("Learning goal 1"), "Count in millions.");

    const saveButton = screen.getByRole("button", { name: "Save draft" });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
    const [topic, content] = onSave.mock.calls[0] as [string, LessonContent];
    expect(topic).toBe("Whole Numbers");
    expect(content.objectives).toEqual(["Count in millions."]);
  });
});
