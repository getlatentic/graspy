import { describe, expect, it } from "vitest";

import { noteJob } from "./lessonNoteJob";
import type { LessonContent } from "./lessonContent";
import type { LessonDraft } from "./lessonPlanning";

function lesson(overrides: Partial<LessonDraft> = {}): LessonDraft {
  return {
    id: "lesson",
    academicSessionId: "session",
    academicPeriodId: "period",
    teachingAssignmentId: "class",
    topic: "Fractions",
    subtopic: "Equivalent fractions",
    learningGoals: ["Compare two fractions."],
    latestVersionNumber: 4,
    steps: [
      {
        title: "Model with a wall",
        teacherActivity: "Show two halves.",
        learnerActivity: "Name an equal pair.",
      },
    ],
    granularRecord: null,
    authoredContent: null,
    ...overrides,
  } as unknown as LessonDraft;
}

/** A hand-written lesson whose taught words the note should prefer. */
const authored = {
  objectives: [],
  instructionalMaterials: [],
  checks: [],
  steps: [
    {
      id: "step",
      title: "Fold a strip",
      blocks: [{ type: "explanation", id: "b", content: "Two halves cover the same length." }],
    },
  ],
} as unknown as LessonContent;

describe("what a student note is written from", () => {
  it("carries the lesson's own identity, so the note is saved against it", () => {
    const job = noteJob(lesson());
    expect(job.lessonId).toBe("lesson");
    expect(job.context).toEqual({
      academicSessionId: "session",
      academicPeriodId: "period",
      teachingAssignmentId: "class",
    });
    expect(job.topic).toBe("Fractions");
    expect(job.subtopic).toBe("Equivalent fractions");
    expect(job.learningGoals).toEqual(["Compare two fractions."]);
  });

  it("stamps the version it was written from, which is what later marks it stale", () => {
    expect(noteJob(lesson({ latestVersionNumber: 7 })).writtenFromVersion).toBe(7);
  });

  it("falls back to the activity shape when the lesson has nothing richer", () => {
    expect(noteJob(lesson()).steps).toEqual([
      {
        title: "Model with a wall",
        summary: "Show two halves. Name an equal pair.",
        taught: [],
        workedExamples: [],
        practice: [],
      },
    ]);
  });

  it("prefers a hand-written lesson's taught words over its activity shape", () => {
    const steps = noteJob(lesson({ authoredContent: authored })).steps;
    expect(steps.map(({ title }) => title)).toEqual(["Fold a strip"]);
    expect(steps[0]?.taught).toContain("Two halves cover the same length.");
  });

  it("prefers a prepared lesson's plan over everything else it holds", () => {
    const prepared = lesson({
      authoredContent: authored,
      granularRecord: {
        plan: {
          topic: "Fractions",
          subtopic: null,
          lessonObjectives: [],
          steps: [
            {
              id: "core",
              sequence: 1,
              role: "core",
              title: "Compare with a wall",
              durationMinutes: 15,
              lessonObjectiveId: null,
              blocks: [
                { type: "explanation", id: "e", content: "A half equals two quarters." },
              ],
            },
          ],
          assessments: [],
          references: [],
        },
      } as never,
    });
    const steps = noteJob(prepared).steps;
    expect(steps.map(({ title }) => title)).toEqual(["Compare with a wall"]);
    expect(steps[0]?.taught).toContain("A half equals two quarters.");
  });
});
