import { describe, expect, it, vi } from "vitest";

import { TauriLessonPlanExportGateway } from "./TauriLessonPlanExportGateway";
import type { LessonPlanExportInput } from "../domain/documentExport";

const input: LessonPlanExportInput = {
  eyebrow: "Number and numeration",
  title: "Millions and billions",
  subtitle: "Millions and billions · Week 1",
  identity: { week: "1", className: "JSS 1", subject: "Mathematics", period: null, duration: "10 minutes" },
  objectives: ["Read whole numbers up to one billion."],
  instructionalMaterials: ["Place-value chart"],
  previousKnowledge: ["Learners can read numbers up to one million."],
  steps: [{ title: "Group the digits", teacherActivity: "Model grouping.", learnerActivity: "Group two numbers.", durationMinutes: 10 }],
  evaluation: ["Exit question"],
  assignment: ["Exercise 2, questions 1 to 5."],
  references: ["New General Mathematics 1"],
};

describe("TauriLessonPlanExportGateway", () => {
  it("saves a validated plan PDF through the native boundary", async () => {
    const nativeInvoke = vi
      .fn()
      .mockResolvedValueOnce({ path: "/tmp/millions-and-billions-plan.pdf", fileName: "millions-and-billions-plan.pdf", byteSize: 4096 });
    const gateway = new TauriLessonPlanExportGateway(nativeInvoke, vi.fn());

    const request = { document: input, destinationPath: "/tmp/millions-and-billions-plan.pdf" };
    await expect(gateway.savePdf(request)).resolves.toMatchObject({ byteSize: 4096 });
    expect(nativeInvoke).toHaveBeenCalledWith("save_lesson_plan_pdf", { request });
  });

  it("uses a PDF-only destination chooser and preserves cancellation", async () => {
    const saveDialog = vi.fn().mockResolvedValue(null);
    const gateway = new TauriLessonPlanExportGateway(vi.fn(), saveDialog);

    await expect(gateway.choosePdfDestination("millions-and-billions-plan.pdf")).resolves.toBeNull();
    expect(saveDialog).toHaveBeenCalledWith({
      defaultPath: "millions-and-billions-plan.pdf",
      filters: [{ name: "PDF document", extensions: ["pdf"] }],
    });
  });

  it("prints the plan through the native document boundary", async () => {
    const nativeInvoke = vi.fn().mockResolvedValue(undefined);
    const gateway = new TauriLessonPlanExportGateway(nativeInvoke, vi.fn());

    await expect(gateway.print(input)).resolves.toBeUndefined();
    expect(nativeInvoke).toHaveBeenCalledWith("print_lesson_plan_document", { input });
  });
});
