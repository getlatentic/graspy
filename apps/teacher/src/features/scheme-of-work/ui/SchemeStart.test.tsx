import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import type { SchemeTemplateSummary } from "../domain/schemeOfWork";
import { SchemeStart } from "./SchemeStart";

const academicContext = {
  sessionLabel: "2026/2027",
  period: { id: "period-first", academicSessionId: "session-2026", ordinal: 1, name: "First term", kind: "term" },
  assignment: { id: "class-mathematics", displayName: "Mathematics · JSS 2 · A" },
  workspace: {
    periods: [
      { id: "period-first", academicSessionId: "session-2026", ordinal: 1, name: "First term", kind: "term" },
      { id: "period-second", academicSessionId: "session-2026", ordinal: 2, name: "Second term", kind: "term" },
      { id: "period-third", academicSessionId: "session-2026", ordinal: 3, name: "Third term", kind: "term" },
    ],
    activeSessionId: "session-2026",
  },
} as unknown as ActiveAcademicContext;

function template(id: string, title: string): SchemeTemplateSummary {
  return {
    id,
    title,
    publisher: "Curriculum office",
    jurisdiction: "Nigeria",
    edition: "2026",
    trust: "verified",
    origin: "bundled",
    weekCount: 1,
    planCount: 1,
    weeks: [{ ordinal: 1, kind: "teaching", title: null, topics: ["Whole numbers"] }],
  };
}

function renderStart(templates: SchemeTemplateSummary[], onCreateFromTemplate = vi.fn()) {
  render(
    <SchemeStart
      academicContext={academicContext}
      sessionStartYear={2026}
      templates={templates}
      pendingAction={null}
      error={null}
      onCreateManual={vi.fn()}
      onCreateFromTemplate={onCreateFromTemplate.mockResolvedValue(true)}
      onImport={vi.fn()}
    />,
  );
}

const first = template("template-first", "Mathematics JSS 2 · Federal");
const second = template("template-second", "Mathematics JSS 2 · State");

describe("choosing a scheme to start from", () => {
  it("previews the first scheme before the teacher has chosen one", () => {
    renderStart([first, second]);
    expect(screen.getByRole("radio", { name: /Federal/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /State/ })).not.toBeChecked();
  });

  it("previews the scheme the teacher picks", async () => {
    renderStart([first, second]);
    await userEvent.click(screen.getByRole("radio", { name: /State/ }));
    expect(screen.getByRole("radio", { name: /State/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Federal/ })).not.toBeChecked();
  });

  it("starts the scheme the teacher picked, not the one that was showing first", async () => {
    const onCreateFromTemplate = vi.fn();
    renderStart([first, second], onCreateFromTemplate);
    await userEvent.click(screen.getByRole("radio", { name: /State/ }));
    await userEvent.click(screen.getByRole("button", { name: /Use this scheme/i }));
    expect(onCreateFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: "template-second" }),
    );
  });

  it("offers nothing to start when the library is empty", () => {
    renderStart([]);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });
});
