import { describe, expect, it, vi } from "vitest";

import { TauriClassworkExportGateway } from "./TauriClassworkExportGateway";

const documentRequest = {
  context: { academicSessionId: "session", academicPeriodId: "period", teachingAssignmentId: "assignment" },
  lessonId: "lesson",
  classworkSet: "original" as const,
  groupId: null,
  copy: "student" as const,
};

describe("TauriClassworkExportGateway", () => {
  it("prepares and saves validated documents through the native boundary", async () => {
    const nativeInvoke = vi.fn()
      .mockResolvedValueOnce({ title: "Fractions", fileName: "fractions-student.pdf", html: "<!doctype html><p>Fractions</p>" })
      .mockResolvedValueOnce({ path: "/tmp/fractions-student.pdf", fileName: "fractions-student.pdf", byteSize: 2048 });
    const gateway = new TauriClassworkExportGateway(nativeInvoke, vi.fn());

    await expect(gateway.prepare(documentRequest)).resolves.toMatchObject({ fileName: "fractions-student.pdf" });
    expect(nativeInvoke).toHaveBeenNthCalledWith(1, "prepare_classwork_export", { request: documentRequest });

    const saveRequest = { document: documentRequest, destinationPath: "/tmp/fractions-student.pdf" };
    await expect(gateway.savePdf(saveRequest)).resolves.toMatchObject({ byteSize: 2048 });
    expect(nativeInvoke).toHaveBeenNthCalledWith(2, "save_classwork_pdf", { request: saveRequest });
  });

  it("uses a PDF-only native destination chooser and preserves cancellation", async () => {
    const saveDialog = vi.fn().mockResolvedValue(null);
    const gateway = new TauriClassworkExportGateway(vi.fn(), saveDialog);

    await expect(gateway.choosePdfDestination("fractions-student.pdf")).resolves.toBeNull();
    expect(saveDialog).toHaveBeenCalledWith({
      defaultPath: "fractions-student.pdf",
      filters: [{ name: "PDF document", extensions: ["pdf"] }],
    });
  });

  it("prints through the native document boundary", async () => {
    const nativeInvoke = vi.fn().mockResolvedValue(undefined);
    const gateway = new TauriClassworkExportGateway(nativeInvoke, vi.fn());

    await expect(gateway.print(documentRequest)).resolves.toBeUndefined();

    expect(nativeInvoke).toHaveBeenCalledWith("print_classwork_document", {
      request: documentRequest,
    });
  });
});
