import { describe, expect, it, vi } from "vitest";

import { TauriDifferentiatedClassworkGateway } from "./TauriDifferentiatedClassworkGateway";

const context = {
  academicSessionId: "session",
  academicPeriodId: "period" as const,
  teachingAssignmentId: "assignment",
};

const workspace = {
  lesson: {
    lessonId: "lesson",
    lessonVersionId: "version",
    lessonVersionNumber: 1,
    subject: "Mathematics",
    grade: "JSS 2",
    topic: "Linear equations",
    subtopic: null,
    learningGoals: ["Solve equations"],
  },
  readiness: { canStart: true, blockers: [] },
  run: null,
};

describe("TauriDifferentiatedClassworkGateway", () => {
  it("uses the native differentiated-classwork commands with a single request envelope", async () => {
    const nativeInvoke = vi.fn().mockResolvedValue(workspace);
    const gateway = new TauriDifferentiatedClassworkGateway(nativeInvoke);
    const request = { context, lessonId: "lesson" };

    await expect(gateway.getWorkspace(request)).resolves.toEqual(workspace);
    await expect(gateway.runGeneration(request)).resolves.toEqual(workspace);
    await gateway.cancelGeneration("group-classwork-run");
    expect(nativeInvoke).toHaveBeenNthCalledWith(1, "get_differentiated_classwork_workspace", { request });
    expect(nativeInvoke).toHaveBeenNthCalledWith(2, "run_differentiated_classwork_generation", {
      request: { ...request, sectionId: null },
    });
    expect(nativeInvoke).toHaveBeenNthCalledWith(3, "cancel_background_task", { taskId: "group-classwork-run" });
  });

  it("rejects malformed native snapshots at the boundary", async () => {
    const gateway = new TauriDifferentiatedClassworkGateway(
      vi.fn().mockResolvedValue({ ...workspace, readiness: { canStart: "yes", blockers: [] } }),
    );
    await expect(gateway.getWorkspace({ context, lessonId: "lesson" })).rejects.toThrow();
  });
});
