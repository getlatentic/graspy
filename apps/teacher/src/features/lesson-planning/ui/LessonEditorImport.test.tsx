import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import type { LessonDocumentImporter } from "../application/LessonDocumentImporter";
import { LessonEditor } from "./LessonEditor";

const academicContext = {
  workspace: { activeSessionId: "session-1" },
  sessionLabel: "2026/2027",
  period: { id: "period-1", name: "First term" },
  assignment: { id: "assignment-1", displayName: "Mathematics · JSS 2" },
} as unknown as ActiveAcademicContext;

function renderEditor(documentImporter: LessonDocumentImporter, onSave = vi.fn()) {
  render(
    <LessonEditor
      academicContext={academicContext}
      lesson={null}
      initialInputMode="pasted"
      schemeEntry={null}
      availableSchemeEntries={[]}
      pending={false}
      error={null}
      onCancel={vi.fn()}
      onSave={onSave}
      bringingIn={{ documentImporter }}
    />,
  );
  return onSave;
}

afterEach(cleanup);

describe("importing a lesson plan from a file", () => {
  it("puts the words in the same box a paste lands in, and builds from them", async () => {
    const user = userEvent.setup();
    const importPlan = vi.fn().mockResolvedValue({
      fileName: "Week 3 fractions.docx",
      text: "Ordering fractions\nCompare halves and quarters.",
    });
    const onSave = renderEditor({ importPlan });

    await user.click(
      screen.getByRole("button", { name: "Import from a Word file or PDF" }),
    );

    // The same field, so everything downstream — reading the plan, preparing,
    // reviewing, confirming — is the path that already exists.
    const planField = await screen.findByLabelText("Lesson plan text");
    expect(planField).toHaveValue("Ordering fractions\nCompare halves and quarters.");
    expect(
      screen.getByText(/Read from Week 3 fractions\.docx/),
    ).toBeVisible();

    await user.type(screen.getByLabelText("Lesson topic"), "Fractions");
    await user.click(screen.getByRole("button", { name: "Write it with graspy" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        inputMode: "pasted",
        rawPlan: "Ordering fractions\nCompare halves and quarters.",
      }),
      true,
    );
  });

  it("says why a file could not be read, and leaves what was typed alone", async () => {
    const user = userEvent.setup();
    const importPlan = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "This PDF has no text in it — it is most likely a scan or a photograph of a page. Type or paste the lesson instead.",
        ),
      );
    renderEditor({ importPlan });

    const planField = screen.getByLabelText("Lesson plan text");
    await user.type(planField, "Half-written plan");
    await user.click(
      screen.getByRole("button", { name: "Import from a Word file or PDF" }),
    );

    expect(await screen.findByText(/most likely a scan/)).toBeVisible();
    expect(planField).toHaveValue("Half-written plan");
  });

  it("says nothing when the teacher closes the picker without choosing", async () => {
    const user = userEvent.setup();
    const importPlan = vi.fn().mockResolvedValue(null);
    renderEditor({ importPlan });

    await user.click(
      screen.getByRole("button", { name: "Import from a Word file or PDF" }),
    );

    expect(screen.queryByText(/Read from/)).not.toBeInTheDocument();
    expect(screen.queryByText(/was not imported/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Lesson plan text")).toHaveValue("");
  });
});
