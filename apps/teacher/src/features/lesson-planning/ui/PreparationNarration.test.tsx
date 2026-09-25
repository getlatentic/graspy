import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PreparationStepProgress } from "../domain/preparationProgress";
import { PreparationNarration } from "./PreparationNarration";

const midRun: readonly PreparationStepProgress[] = [
  { step: "learning-goals", state: "done" },
  { step: "prior-knowledge", state: "done" },
  { step: "checks", state: "running" },
  { step: "source-material", state: "pending" },
  { step: "teaching-sequence", state: "pending" },
  { step: "practice", state: "pending" },
  { step: "putting-together", state: "pending" },
];

describe("PreparationNarration", () => {
  it("shows the whole sequence, so the wait has a known length", () => {
    render(<PreparationNarration progress={midRun} onCancel={() => undefined} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getByText("2 of 7 steps done")).toBeVisible();
  });

  it("says what is happening now in words a teacher would use", () => {
    render(<PreparationNarration progress={midRun} onCancel={() => undefined} />);

    expect(
      screen.getByText("Writing the questions that check understanding"),
    ).toBeVisible();
  });

  it("never shows the names the program uses for its own work", () => {
    const { container } = render(
      <PreparationNarration progress={midRun} onCancel={() => undefined} />,
    );

    expect(container.textContent).not.toMatch(
      /objective-decomposition|knowledge-planning|assemble|validate-complete-plan|node|lesson-plan\./i,
    );
  });

  it("can be stopped while the work is still going", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<PreparationNarration progress={midRun} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("says it is starting before the run reports a step", () => {
    render(<PreparationNarration progress={[]} onCancel={() => undefined} />);

    expect(screen.getByText("Starting")).toBeVisible();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
