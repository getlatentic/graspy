import { describe, expect, it } from "vitest";

import { lessonChecks } from "./lessonChecks";
import type { LessonDraft } from "./lessonPlanning";

function lesson(overrides: Partial<LessonDraft> = {}): LessonDraft {
  return {
    id: "lesson",
    academicSessionId: "session",
    academicPeriodId: "period",
    academicPeriodName: "First term",
    teachingAssignmentId: "class",
    schemeWeekId: null,
    schemeEntryId: null, classworkComplete: false,
    inputMode: "structured",
    planFormat: "legacy_import",
    topic: "Linear equations",
    subtopic: null,
    rawPlan: null,
    sourcePlanText: null,
    learningGoals: [],
    steps: [],
    instructionalMaterials: [],
    assessment: [],
    references: [],
    curriculumUnit: null,
    curriculumOutcomes: [],
    status: "draft",
    latestVersionNumber: 1,
    preparation: null,
    granularRecord: null,
    ...overrides,
  } as unknown as LessonDraft;
}

function prepared(assessments: unknown[]): Partial<LessonDraft> {
  return { granularRecord: { plan: { assessments } } } as unknown as Partial<LessonDraft>;
}

describe("the checks a lesson carries", () => {
  it("carries none when the lesson has none", () => {
    expect(lessonChecks(lesson())).toEqual([]);
  });

  it("shows a hand-written question with no answer behind it", () => {
    const checks = lessonChecks(lesson({ assessment: ["Solve 2x + 3 = 11"] }));
    expect(checks).toEqual([
      { question: "Solve 2x + 3 = 11", objective: null, answer: null, rubric: [] },
    ]);
  });

  it("reads the answer and marking points off a prepared lesson's record", () => {
    const checks = lessonChecks(
      lesson(
        prepared([
          {
            question: "Solve 2x + 3 = 11",
            expectedAnswer: "x = 4",
            rubric: ["Subtracts 3 from both sides", "Divides by 2"],
          },
        ]),
      ),
    );
    expect(checks).toEqual([
      {
        question: "Solve 2x + 3 = 11",
        objective: null,
        answer: "x = 4",
        rubric: ["Subtracts 3 from both sides", "Divides by 2"],
      },
    ]);
  });

  it("prefers the record over the flat questions, which are the same checks written thinner", () => {
    const checks = lessonChecks(
      lesson({
        assessment: ["Solve 2x + 3 = 11"],
        ...prepared([{ question: "Solve 2x + 3 = 11", expectedAnswer: "x = 4", rubric: [] }]),
      }),
    );
    expect(checks).toHaveLength(1);
    expect(checks[0]?.answer).toBe("x = 4");
  });

  it("splits the goal off a question that restates it before asking", () => {
    const checks = lessonChecks(
      lesson({ assessment: ["Solve linear equations. What is x when 2x + 3 = 11?"] }),
    );
    expect(checks[0]?.objective).toBe("Solve linear equations");
    expect(checks[0]?.question).toBe("What is x when 2x + 3 = 11?");
  });

  it("splits a prepared check's goal off the same way", () => {
    const checks = lessonChecks(
      lesson(
        prepared([
          {
            question: "Solve linear equations. What is x when 2x + 3 = 11?",
            expectedAnswer: "x = 4",
            rubric: [],
          },
        ]),
      ),
    );
    expect(checks[0]?.objective).toBe("Solve linear equations");
    expect(checks[0]?.answer).toBe("x = 4");
  });
});
