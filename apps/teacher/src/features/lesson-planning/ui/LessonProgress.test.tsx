import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LessonProgress } from "./LessonProgress";

describe("the three steps a lesson goes through", () => {
  /// There are two three-step stories in this product — the journey a teacher
  /// takes (a term plan, a lesson, its classwork) and one lesson's own life —
  /// and only this one is numbered. Unlabelled, a 1-2-3 at the top of a lesson
  /// reads as the whole product's.
  it("says whose three steps these are", () => {
    render(<LessonProgress status="draft" hasPlan={false} classworkWritten={false} />);

    expect(screen.getByText("This lesson")).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "This lesson's progress" }),
    ).toBeVisible();
  });

  /// The strip named "Create the classwork" at the top of the lesson while the
  /// only way to do it sat past seven lesson steps, about fifty scroll ticks
  /// below. Naming a next step and not being it is what this fixes.
  it("takes the teacher to the step they are on", async () => {
    const user = userEvent.setup();
    const openClasswork = vi.fn();
    render(<LessonProgress status="confirmed" hasPlan classworkWritten={false} onGoToNow={openClasswork} />);

    await user.click(screen.getByRole("button", { name: "Create the classwork" }));

    expect(openClasswork).toHaveBeenCalled();
  });

  it("leaves the steps as plain words where the screen has nowhere to take them", () => {
    render(<LessonProgress status="confirmed" hasPlan classworkWritten={false} />);

    expect(screen.getByText("Create the classwork")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  /// Only the step in hand is a way through: the ones already done and the ones
  /// still to come are a report, and making them pressable would invite a
  /// teacher to skip the middle.
  it("offers no way through for a step that is not the one in hand", () => {
    render(<LessonProgress status="draft" hasPlan onGoToNow={vi.fn()} classworkWritten={false} />);

    expect(screen.getByRole("button", { name: "Confirm the plan" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create the classwork" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Write the plan" })).not.toBeInTheDocument();
  });
});
