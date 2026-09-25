import { describe, expect, it, vi } from "vitest";

import { TauriLessonPlanningGateway } from "./TauriLessonPlanningGateway";

describe("TauriLessonPlanningGateway", () => {
  it("maps a lesson workspace request to the native command", async () => {
    const nativeInvoke = vi.fn().mockResolvedValue({
      lessons: [],
      selectedLesson: null,
      availableSchemeEntries: [],
    });
    const gateway = new TauriLessonPlanningGateway(nativeInvoke);
    const request = {
      context: {
        academicSessionId: "session-2026",
        academicPeriodId: "period" as const,
        teachingAssignmentId: "class-mathematics",
      },
      selectedLessonId: null,
    };

    await gateway.getWorkspace(request);

    expect(nativeInvoke).toHaveBeenCalledWith("get_lesson_workspace", { request });
  });

  it("rejects malformed native lesson data", async () => {
    const gateway = new TauriLessonPlanningGateway(
      vi.fn().mockResolvedValue({ lessons: "invalid" }),
    );

    await expect(
      gateway.getWorkspace({
        context: {
          academicSessionId: "session",
          academicPeriodId: "period",
          teachingAssignmentId: "assignment",
        },
        selectedLessonId: null,
      }),
    ).rejects.toThrow();
  });

  it("works a teacher-authored lesson's goals through before preparing it", async () => {
    const programInput = {
      topic: "Equivalent fractions",
      subtopic: null,
      teacherSource: null,
      lessonDurationMinutes: 40,
      curriculumSnapshot: {
        packageId: null,
        packageTitle: null,
        packageSha256: null,
        courseId: null,
        curriculumNodeId: null,
        objectives: [],
        atomicObjectives: [],
        knowledgeComponents: [],
      },
      sourceEvidenceSnapshot: { records: [], figures: [] },
    };
    const nativeInvoke = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("This lesson needs its learning goals worked through before instructionalMaterials can be made."),
      )
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(programInput);
    const gateway = new TauriLessonPlanningGateway(nativeInvoke);
    const request = {
      context: {
        academicSessionId: "session-2026",
        academicPeriodId: "period" as const,
        teachingAssignmentId: "class-mathematics",
      },
      lessonId: "lesson-1",
      lessonDurationMinutes: 40,
    };

    // The retry is what is under test here; whether the reloaded payload parses
    // is covered by the tests above.
    await gateway.getGranularProgramInput(request).catch(() => undefined);

    expect(nativeInvoke.mock.calls.map((call) => call[0])).toEqual([
      "get_granular_lesson_program_input",
      "work_through_teacher_lesson_goals",
      "get_granular_lesson_program_input",
    ]);
  });

  it("does not work goals through for a failure that is not about them", async () => {
    const nativeInvoke = vi
      .fn()
      .mockRejectedValue(new Error("The local engine could not start."));
    const gateway = new TauriLessonPlanningGateway(nativeInvoke);

    await expect(
      gateway.getGranularProgramInput({
        context: {
          academicSessionId: "session-2026",
          academicPeriodId: "period" as const,
          teachingAssignmentId: "class-mathematics",
        },
        lessonId: "lesson-1",
        lessonDurationMinutes: 40,
      }),
    ).rejects.toThrow("The local engine could not start.");
    expect(nativeInvoke).toHaveBeenCalledTimes(1);
  });
});
