import { describe, expect, it, vi } from "vitest";

import { TauriAcademicWorkspaceGateway } from "./TauriAcademicWorkspaceGateway";

const emptySnapshot = {
  workspace: null,
  subjects: [{ id: "subject-mathematics", name: "Mathematics" }],
  gradeLevels: [{ id: "grade-jss-2", gradeSystemId: "grade-system-ng", code: "JSS2", displayName: "JSS 2" }],
  jurisdictions: [{ id: "jurisdiction-ng", countryCode: "NG", country: "Nigeria", name: "Nigeria" }],
  gradeSystems: [{ id: "grade-system-ng", jurisdictionId: "jurisdiction-ng", name: "Nigerian basic and secondary education", version: "1" }],
};

describe("TauriAcademicWorkspaceGateway", () => {
  it("maps workspace creation to the native command contract", async () => {
    const nativeInvoke = vi.fn().mockResolvedValue(emptySnapshot);
    const gateway = new TauriAcademicWorkspaceGateway(nativeInvoke);
    const request = {
      startYear: 2026,
      jurisdictionId: "jurisdiction-ng",
      gradeSystemId: "grade-system-ng",
      calendarKind: "terms" as const,
      periodNames: ["First term", "Second term", "Third term"],
      activePeriodOrdinal: 1,
      assignments: [
        { subject: "Mathematics", gradeLevelId: "grade-jss-2", classSection: "A" },
        { subject: "Basic Science", gradeLevelId: "grade-jss-1", classSection: null },
      ],
    };

    await gateway.createWorkspace(request);

    expect(nativeInvoke).toHaveBeenCalledWith("create_academic_workspace", {
      request,
    });
  });

  it("rejects an invalid native payload at the infrastructure boundary", async () => {
    const gateway = new TauriAcademicWorkspaceGateway(
      vi.fn().mockResolvedValue({ workspace: "invalid" }),
    );

    await expect(gateway.getSnapshot()).rejects.toThrow();
  });

  it("assigns a curriculum through the academic workspace contract", async () => {
    const nativeInvoke = vi.fn().mockResolvedValue(emptySnapshot);
    const gateway = new TauriAcademicWorkspaceGateway(nativeInvoke);
    const request = {
      assignmentId: "assignment-1",
      curriculumCourseId: "course-1",
    };

    await gateway.assignCurriculumCourse(request);

    expect(nativeInvoke).toHaveBeenCalledWith("assign_curriculum_course", {
      request,
    });
  });
});
