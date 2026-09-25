import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import type { LessonDocumentImporter } from "../application/LessonDocumentImporter";
import type { LessonPhotographReader } from "../application/LessonPhotographReader";
import { LessonEditor } from "./LessonEditor";

const academicContext = {
  workspace: { activeSessionId: "session-1" },
  sessionLabel: "2026/2027",
  period: { id: "period-1", name: "First term" },
  assignment: { id: "assignment-1", displayName: "Mathematics · JSS 2" },
} as unknown as ActiveAcademicContext;

const A_PAGE = "data:image/jpeg;base64,/9j/photographed-page";

/// A machine with the file that lets the model read a page.
const reads = () => vi.fn().mockResolvedValue(true);

function renderEditor(
  photographReader: LessonPhotographReader,
  documentImporter?: LessonDocumentImporter,
  photographReadingSetup?: (onReady: () => void) => ReactNode,
) {
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
      onSave={vi.fn()}
      bringingIn={{ documentImporter, photographReader, photographReadingSetup }}
    />,
  );
}

afterEach(cleanup);

describe("reading a lesson plan off a photograph", () => {
  /// Setting the reading up is where the way in comes from, so the button
  /// appears the moment a teacher has done it rather than at the next restart.
  it("opens the way in as soon as a teacher has set the reading up", async () => {
    const user = userEvent.setup();
    let canRead = false;
    renderEditor(
      {
        canRead: vi.fn().mockImplementation(() => Promise.resolve(canRead)),
        readPlan: vi.fn(),
        stopReading: vi.fn(),
      },
      undefined,
      (onReady) => (
        <button
          type="button"
          onClick={() => {
            canRead = true;
            onReady();
          }}
        >
          Set up reading from photographs
        </button>
      ),
    );

    expect(
      screen.queryByRole("button", { name: "Read a photograph of the plan" }),
    ).not.toBeInTheDocument();
    await user.click(
      await screen.findByRole("button", { name: "Set up reading from photographs" }),
    );

    expect(
      await screen.findByRole("button", { name: "Read a photograph of the plan" }),
    ).toBeVisible();
  });

  /// Reading takes a second file beside the model's weights, and a machine
  /// without one is not offered a way in that could only fail.
  it("is not offered on a machine that has not got what it takes", async () => {
    renderEditor({
      canRead: vi.fn().mockResolvedValue(false),
      readPlan: vi.fn(),
      stopReading: vi.fn(),
    });

    expect(await screen.findByLabelText("Lesson plan text")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Read a photograph of the plan" }),
    ).not.toBeInTheDocument();
  });

  it("puts the words in the same box a paste lands in, and keeps the page beside them", async () => {
    const user = userEvent.setup();
    const readPlan = vi.fn().mockResolvedValue({
      fileName: "lesson-plan-1.jpeg",
      text: "TOPIC: THREE DIMENSIONAL SHAPES\nBehavioural objectives:",
      page: A_PAGE,
    });
    renderEditor({ canRead: reads(), readPlan, stopReading: vi.fn() });

    await user.click(
      await screen.findByRole("button", { name: "Read a photograph of the plan" }),
    );

    expect(await screen.findByLabelText("Lesson plan text")).toHaveValue(
      "TOPIC: THREE DIMENSIONAL SHAPES\nBehavioural objectives:",
    );
    // Two written words in three come back, so the words are only correctable
    // while the page they were read from is on screen.
    expect(screen.getByAltText("The photographed lesson plan")).toHaveAttribute("src", A_PAGE);
    expect(screen.getByText(/Read from lesson-plan-1\.jpeg/)).toBeVisible();
  });

  it("can be stopped rather than waited out", async () => {
    const user = userEvent.setup();
    const stopReading = vi.fn().mockResolvedValue(undefined);
    renderEditor({
      canRead: reads(),
      readPlan: vi.fn().mockReturnValue(new Promise(() => {})),
      stopReading,
    });

    await user.click(
      await screen.findByRole("button", { name: "Read a photograph of the plan" }),
    );
    expect(await screen.findByText(/takes about a minute/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Stop reading" }));

    expect(stopReading).toHaveBeenCalled();
  });

  /// Both ways in report into one place, so what a teacher reads is the result
  /// of the way in they just took and never the one before it.
  it("drops what the last way in said as soon as another one starts", async () => {
    const user = userEvent.setup();
    const importPlan = vi
      .fn()
      .mockResolvedValue({ fileName: "Week 3.docx", text: "Ordering fractions" });
    let refuse = (_: Error) => {};
    const readPlan = vi.fn().mockReturnValue(new Promise((_, reject) => (refuse = reject)));
    renderEditor({ canRead: reads(), readPlan, stopReading: vi.fn() }, { importPlan });

    await user.click(screen.getByRole("button", { name: "Import from a Word file or PDF" }));
    expect(await screen.findByText(/Read from Week 3\.docx/)).toBeVisible();
    await user.click(
      await screen.findByRole("button", { name: "Read a photograph of the plan" }),
    );

    expect(screen.queryByText(/Read from Week 3\.docx/)).not.toBeInTheDocument();
    refuse(new Error("That photograph could not be opened. Try taking it again."));
    expect(await screen.findByText(/could not be opened/)).toBeVisible();
    expect(screen.getByLabelText("Lesson plan text")).toHaveValue("Ordering fractions");
  });
});
