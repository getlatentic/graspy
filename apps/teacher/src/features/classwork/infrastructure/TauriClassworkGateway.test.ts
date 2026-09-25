import { describe, expect, it, vi } from "vitest";

import { TauriClassworkGateway } from "./TauriClassworkGateway";

const request = {
  context: {
    academicSessionId: "session",
    academicPeriodId: "period" as const,
    teachingAssignmentId: "assignment",
  },
  lessonId: "lesson",
  figureId: "figure",
};

const workspace = {
  lesson: {
    lessonId: "lesson",
    lessonVersionId: "lesson-version",
    lessonVersionNumber: 1,
    subject: "Mathematics",
    grade: "JSS 2",
    topic: "Equivalent fractions",
    subtopic: null,
    learningGoals: ["Compare equivalent fractions."],
  },
  run: {
    id: "run",
    taskId: "lesson-classwork-run",
    status: "complete",
    lessonVersionId: "lesson-version",
    lessonVersionNumber: 1,
    documentVersion: { id: "classwork-version", versionNumber: 2, status: "draft", changeKind: "initial", changedSectionId: null, teacherDirection: null, restoredFromVersionNumber: null, createdAt: "2026-07-30 10:00:00", approvedAt: null },
    sources: [],
    figures: [],
    sections: [{
      id: "section",
      sequence: 1,
      stepTitle: "Compare models",
      status: "done",
      title: "Equivalent fractions",
      learningGoalNumbers: [1],
      attemptCount: 1,
      lastError: null,
      quality: null,
      regenerated: false,
      blocks: [{
        id: "block",
        kind: "review",
        text: "Compare one half and two quarters.",
        learningGoalNumbers: [1],
        sourceMaterialKeys: [],
        teacherEdited: true,
      }],
    }],
  },
};

describe("TauriClassworkGateway", () => {
  it("requests the authorized native figure and accepts local PNG data", async () => {
    const nativeInvoke = vi.fn().mockResolvedValue("data:image/png;base64,dHJ1c3RlZA==");
    const gateway = new TauriClassworkGateway(nativeInvoke);

    await expect(gateway.getFigureData(request)).resolves.toBe(
      "data:image/png;base64,dHJ1c3RlZA==",
    );
    expect(nativeInvoke).toHaveBeenCalledWith("get_classwork_figure", { request });
  });

  it("rejects remote and malformed figure values before rendering", async () => {
    const gateway = new TauriClassworkGateway(
      vi.fn().mockResolvedValue("https://example.com/untrusted.png"),
    );

    await expect(gateway.getFigureData(request)).rejects.toThrow();
  });

  it("sends version-fenced edit and approval commands through the native boundary", async () => {
    const nativeInvoke = vi.fn().mockResolvedValue(workspace);
    const gateway = new TauriClassworkGateway(nativeInvoke);
    const context = request.context;

    await expect(gateway.editBlock({
      context,
      runId: "run",
      blockId: "block",
      expectedVersionNumber: 1,
      text: "Compare one half and two quarters.",
    })).resolves.toEqual(workspace);
    expect(nativeInvoke).toHaveBeenCalledWith("edit_classwork_block", {
      request: {
        context,
        runId: "run",
        blockId: "block",
        expectedVersionNumber: 1,
        text: "Compare one half and two quarters.",
      },
    });

    await expect(gateway.approveVersion({
      context,
      runId: "run",
      expectedVersionNumber: 2,
    })).resolves.toEqual(workspace);
    expect(nativeInvoke).toHaveBeenLastCalledWith("approve_classwork_version", {
      request: { context, runId: "run", expectedVersionNumber: 2 },
    });
  });

  it("routes section recreation and restore through token and version fences", async () => {
    const nativeInvoke = vi.fn().mockResolvedValue(workspace);
    const gateway = new TauriClassworkGateway(nativeInvoke);
    const context = request.context;

    await gateway.regenerateSection({
      context,
      runId: "run",
      sectionId: "section",
      expectedVersionNumber: 1,
      teacherDirection: "Use smaller numbers.",
    });
    expect(nativeInvoke).toHaveBeenCalledWith("regenerate_classwork_section", expect.objectContaining({
      request: expect.objectContaining({ sectionId: "section", expectedVersionNumber: 1 }),
    }));

    // The id is the backend's, carried on the run. Rebuilding it here was one
    // rule in two languages, and the copy drifted without a test noticing.
    await gateway.cancelGeneration("lesson-classwork-run");
    expect(nativeInvoke).toHaveBeenLastCalledWith("cancel_background_task", {
      taskId: "lesson-classwork-run",
    });

    await gateway.restoreSection({
      context,
      runId: "run",
      sectionId: "section",
      sourceVersionNumber: 1,
      expectedVersionNumber: 2,
    });
    expect(nativeInvoke).toHaveBeenLastCalledWith("restore_classwork_section", {
      request: { context, runId: "run", sectionId: "section", sourceVersionNumber: 1, expectedVersionNumber: 2 },
    });
  });
});
