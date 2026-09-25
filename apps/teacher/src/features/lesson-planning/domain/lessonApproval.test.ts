import { describe, expect, it } from "vitest";

import { planExportInput, planFileName } from "./lessonApproval";
import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import type { LessonDraft } from "./lessonPlanning";

function lesson(overrides: Partial<LessonDraft> = {}): LessonDraft {
  return {
    topic: "Fractions",
    subtopic: "Equivalent fractions",
    learningGoals: ["Compare two fractions."],
    steps: [
      {
        id: "step",
        sequence: 1,
        title: "Model with a wall",
        teacherActivity: "Show two halves.",
        learnerActivity: "Name an equal pair.",
        durationMinutes: 15,
      },
    ],
    instructionalMaterials: ["Fraction wall"],
    previousKnowledge: ["Learners can name equal parts of one whole."],
    assessment: ["Exit problem"],
    assignment: ["Exercise 5, questions 1 to 4."],
    references: ["School mathematics text"],
    ...overrides,
  } as unknown as LessonDraft;
}

const academicContext = {
  assignment: {
    displayName: "Mathematics · JSS 2 · A",
    subject: "Mathematics",
    gradeLevel: "JSS 2",
    classSection: "A",
  },
} as unknown as ActiveAcademicContext;

describe("the file a teacher saves a plan as", () => {
  it("is named for the lesson, so a folder of them can be told apart", () => {
    expect(planFileName(lesson())).toBe("equivalent-fractions-plan.pdf");
  });

  it("falls back to the topic when the lesson has no subtopic", () => {
    expect(planFileName(lesson({ subtopic: null }))).toBe("fractions-plan.pdf");
  });

  it("keeps punctuation and spacing out of the name a file system has to hold", () => {
    expect(planFileName(lesson({ subtopic: "L.C.M. & H.C.F. (by inspection)" }))).toBe(
      "l-c-m-h-c-f-by-inspection-plan.pdf",
    );
  });

  it("leaves no dash hanging at either end", () => {
    const name = planFileName(lesson({ subtopic: "  ¡Fracciones!  " }));
    expect(name).toBe("fracciones-plan.pdf");
  });

  it("still names a file when the title survives none of that", () => {
    expect(planFileName(lesson({ subtopic: "———" }))).toBe("lesson-plan.pdf");
  });
});

describe("the plan document a school reads", () => {
  it("leads with the subtopic, keeping the topic as the line above it", () => {
    const input = planExportInput(lesson(), 3, academicContext);
    expect(input.eyebrow).toBe("Fractions");
    expect(input.title).toBe("Equivalent fractions");
  });

  it("says only the lesson when there is no subtopic to lead with", () => {
    const input = planExportInput(lesson({ subtopic: null }), null, academicContext);
    expect(input.eyebrow).toBe("Lesson");
    expect(input.title).toBe("Fractions");
  });

  it("places the lesson in its week", () => {
    expect(planExportInput(lesson(), 3, academicContext).subtitle).toBe(
      "Equivalent fractions · Week 3",
    );
  });

  it("names the class instead when the plan sits in no week and has no subtopic", () => {
    expect(planExportInput(lesson({ subtopic: null }), null, academicContext).subtitle).toBe(
      "Mathematics · JSS 2 · A",
    );
  });

  it("carries the plan a school reads, under the names on that paper", () => {
    const input = planExportInput(lesson(), 1, academicContext);
    expect(input.objectives).toEqual(["Compare two fractions."]);
    expect(input.instructionalMaterials).toEqual(["Fraction wall"]);
    expect(input.previousKnowledge).toEqual(["Learners can name equal parts of one whole."]);
    expect(input.evaluation).toEqual(["Exit problem"]);
    expect(input.assignment).toEqual(["Exercise 5, questions 1 to 4."]);
    expect(input.references).toEqual(["School mathematics text"]);
    expect(input.steps).toEqual([
      {
        title: "Model with a wall",
        teacherActivity: "Show two halves.",
        learnerActivity: "Name an equal pair.",
        durationMinutes: 15,
      },
    ]);
  });

  it("states the lesson by week, class, subject and length", () => {
    expect(planExportInput(lesson(), 3, academicContext).identity).toEqual({
      week: "3",
      className: "JSS 2A",
      subject: "Mathematics",
      period: null,
      duration: "15 minutes",
    });
  });

  // The period on a lesson plan is the slot on a timetable. graspy's own
  // "period" is the term, so naming that would put the wrong answer on the line
  // a school checks — the answer comes from the class's timetable or not at all.
  it("leaves the period and the length unstated rather than guessing them", () => {
    const identity = planExportInput(
      lesson({ steps: [{ ...lesson().steps[0], durationMinutes: null }] }),
      null,
      academicContext,
    ).identity;
    expect(identity.period).toBeNull();
    expect(identity.duration).toBeNull();
    expect(identity.week).toBeNull();
  });

  // A week's plan is taught across every period the class has that week, so the
  // line carries all of them rather than only the first.
  it("states every period the class is taught in, from its timetable", () => {
    const identity = planExportInput(lesson(), 3, academicContext, [
      { weekday: "thursday", period: 5 },
      { weekday: "monday", period: 2 },
    ]).identity;
    expect(identity.period).toBe("2, 5");
  });
});
