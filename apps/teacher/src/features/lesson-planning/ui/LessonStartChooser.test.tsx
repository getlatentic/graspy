import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import { LessonStartChooser } from "./LessonStartChooser";

const academicContext = {
  assignment: { displayName: "Mathematics · JSS 1" },
  sessionLabel: "2025/2026",
  period: { name: "First term" },
} as unknown as ActiveAcademicContext;

describe("LessonStartChooser", () => {
  it("offers the three ways to start, each with a sentence and its own route", async () => {
    const user = userEvent.setup();
    const onStartBlank = vi.fn();
    const onDraftWithGraspy = vi.fn();
    const onBringYourOwn = vi.fn();
    render(
      <LessonStartChooser
        academicContext={academicContext}
        onStartBlank={onStartBlank}
        onDraftWithGraspy={onDraftWithGraspy}
        onBringYourOwn={onBringYourOwn}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Write the plan yourself.")).toBeVisible();
    expect(
      screen.getByText(/graspy starts writing now, from your topic and goals/),
    ).toBeVisible();
    expect(
      screen.getByText("Paste a plan you already have and graspy structures it."),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: /Write it myself/ }));
    expect(onStartBlank).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /Let graspy draft it/ }));
    expect(onDraftWithGraspy).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /Paste a plan I already have/ }));
    expect(onBringYourOwn).toHaveBeenCalledTimes(1);
  });
});
