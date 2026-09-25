import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ClassworkExportGateway } from "../application/ClassworkExportGateway";
import { ClassworkExportDialog } from "./ClassworkExportDialog";

const context = { academicSessionId: "session", academicPeriodId: "period", teachingAssignmentId: "assignment" };
const prepared = {
  title: "Equivalent fractions - Classwork",
  fileName: "equivalent-fractions-original-classwork-student.pdf",
  html: "<!doctype html><html><body>Equivalent fractions</body></html>",
};

function gateway(overrides: Partial<ClassworkExportGateway> = {}): ClassworkExportGateway {
  return {
    prepare: vi.fn().mockResolvedValue(prepared),
    choosePdfDestination: vi.fn().mockResolvedValue("/tmp/equivalent-fractions.pdf"),
    savePdf: vi.fn().mockResolvedValue({ path: "/tmp/equivalent-fractions.pdf", fileName: prepared.fileName, byteSize: 2048 }),
    print: vi.fn(),
    ...overrides,
  };
}

describe("ClassworkExportDialog", () => {
  it("opens with the student copy and reloads the preview when the teacher copy is chosen", async () => {
    const exportGateway = gateway();
    const user = userEvent.setup();
    render(<ClassworkExportDialog context={context} gateway={exportGateway} lessonId="lesson" classworkSet="original" />);

    await user.click(screen.getByRole("button", { name: "Export and print" }));
    expect(await screen.findByTitle(/paper preview/u)).toBeInTheDocument();
    expect(exportGateway.prepare).toHaveBeenCalledWith(expect.objectContaining({ copy: "student", classworkSet: "original", groupId: null }));

    await user.click(screen.getByLabelText("Teacher, with answers"));
    await waitFor(() => expect(exportGateway.prepare).toHaveBeenLastCalledWith(expect.objectContaining({ copy: "teacher" })));
    expect(screen.getByText(/Includes answers/u)).toBeInTheDocument();
  });

  it("treats a cancelled destination chooser as a return to the ready state", async () => {
    const exportGateway = gateway({ choosePdfDestination: vi.fn().mockResolvedValue(null) });
    const user = userEvent.setup();
    render(<ClassworkExportDialog context={context} gateway={exportGateway} lessonId="lesson" classworkSet="original" />);

    await user.click(screen.getByRole("button", { name: "Export and print" }));
    await user.click(await screen.findByRole("button", { name: "Save PDF" }));

    await waitFor(() => expect(exportGateway.choosePdfDestination).toHaveBeenCalledWith(prepared.fileName));
    expect(exportGateway.savePdf).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save PDF" })).toBeEnabled();
  });

  it("saves the re-authorized document and shows its exact destination", async () => {
    const exportGateway = gateway();
    const user = userEvent.setup();
    render(<ClassworkExportDialog context={context} gateway={exportGateway} lessonId="lesson" classworkSet="original" />);

    await user.click(screen.getByRole("button", { name: "Export and print" }));
    await user.click(await screen.findByRole("button", { name: "Save PDF" }));

    expect(await screen.findByText("PDF saved")).toBeInTheDocument();
    expect(screen.getByText("/tmp/equivalent-fractions.pdf")).toBeInTheDocument();
    expect(exportGateway.savePdf).toHaveBeenCalledWith({
      document: expect.objectContaining({ copy: "student", lessonId: "lesson" }),
      destinationPath: "/tmp/equivalent-fractions.pdf",
    });
  });

  it("shows the exact native failure when PDF rendering fails", async () => {
    const exportGateway = gateway({ savePdf: vi.fn().mockRejectedValue("The A4 PDF renderer returned an incomplete document.") });
    const user = userEvent.setup();
    render(<ClassworkExportDialog context={context} gateway={exportGateway} lessonId="lesson" classworkSet="original" />);

    await user.click(screen.getByRole("button", { name: "Export and print" }));
    await user.click(await screen.findByRole("button", { name: "Save PDF" }));

    expect(await screen.findByText("The A4 PDF renderer returned an incomplete document.")).toBeInTheDocument();
  });

  it("offers only complete group targets to the native request", async () => {
    const exportGateway = gateway();
    const user = userEvent.setup();
    render(
      <ClassworkExportDialog
        context={context}
        gateway={exportGateway}
        lessonId="lesson"
        classworkSet="group"
        targets={[{ id: "guided", name: "Guided practice" }, { id: "challenge", name: "Further challenge" }]}
        initialTargetId="challenge"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Export and print" }));
    await waitFor(() => expect(exportGateway.prepare).toHaveBeenCalledWith(expect.objectContaining({ classworkSet: "group", groupId: "challenge" })));
  });
});
