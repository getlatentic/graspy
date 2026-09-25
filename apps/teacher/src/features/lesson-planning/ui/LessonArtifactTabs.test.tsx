import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LessonArtifactTabs } from "./LessonArtifactTabs";

const note = {
  note: null,
  hasPlan: true,
  generating: false,
  error: null,
  stale: false,
  onGenerate: vi.fn(),
};

describe("what a teacher is told about the PDF they saved", () => {
  /// A PDF was written to the laptop and nothing on screen said so, or where —
  /// which for a teacher whose next step is paper or a phone is the only part
  /// that matters.
  it("says where the file went", () => {
    render(
      <LessonArtifactTabs
        note={note}
        onExport={vi.fn()}
        exportOutcome={{ kind: "saved", path: "/Volumes/USB/millions-plan.pdf" }}
        plan={<p>the plan</p>}
      />,
    );

    expect(screen.getByText("/Volumes/USB/millions-plan.pdf")).toBeVisible();
  });

  it("says plainly when it did not save, and why", () => {
    render(
      <LessonArtifactTabs
        note={note}
        onExport={vi.fn()}
        exportOutcome={{ kind: "failed", message: "There was no room on the disk." }}
        plan={<p>the plan</p>}
      />,
    );

    expect(screen.getByText(/Not saved\. There was no room on the disk\./)).toBeVisible();
  });

  it("says nothing at all before anything has been saved", () => {
    render(
      <LessonArtifactTabs note={note} onExport={vi.fn()} exportOutcome={null} plan={<p>the plan</p>} />,
    );

    expect(screen.queryByText(/Saved to/)).not.toBeInTheDocument();
  });
});
