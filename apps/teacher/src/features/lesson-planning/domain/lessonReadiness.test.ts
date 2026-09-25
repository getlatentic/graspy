import { describe, expect, it } from "vitest";

import { authoredContentOf, awaitsPlan, granularRecordOf, hasPlan } from "./lessonReadiness";
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

describe("what a lesson already has written", () => {
  it("has no plan when it is only a topic", () => {
    expect(hasPlan(lesson())).toBe(false);
    expect(hasPlan(null)).toBe(false);
  });

  it("has a plan once it is confirmed, whatever its steps say", () => {
    expect(hasPlan(lesson({ status: "confirmed" }))).toBe(true);
  });

  it("has a plan once it carries a teaching sequence", () => {
    expect(hasPlan(lesson({ steps: [{ id: "s" }] as unknown as LessonDraft["steps"] }))).toBe(true);
  });

  /// A pasted plan is content to prepare from, not an empty lesson — the
  /// distinction that decides whether a teacher is offered the start choices.
  it("has a plan once text has been pasted into it, but not from whitespace", () => {
    expect(hasPlan(lesson({ rawPlan: "Topic: equations\nSteps: one" }))).toBe(true);
    expect(hasPlan(lesson({ rawPlan: "   \n  " }))).toBe(false);
  });

  it("reads the detailed plan from a preparation ahead of the lesson's own", () => {
    const prepared = { plan: { from: "preparation" } } as unknown as NonNullable<
      ReturnType<typeof granularRecordOf>
    >;
    const own = { plan: { from: "lesson" } } as unknown as typeof prepared;
    expect(granularRecordOf(lesson({ preparation: { granularRecord: prepared } as never, granularRecord: own }))).toBe(prepared);
    expect(granularRecordOf(lesson({ granularRecord: own }))).toBe(own);
  });

  /// A confirmed lesson's content is its confirmed version, so the draft
  /// readers stay quiet rather than answering from a superseded draft.
  it("reads no draft content from a confirmed lesson", () => {
    const confirmed = lesson({ status: "confirmed", granularRecord: {} as never, authoredContent: {} as never });
    expect(granularRecordOf(confirmed)).toBeNull();
    expect(authoredContentOf(confirmed)).toBeNull();
  });

  /// The failure this guards: a lesson being prepared showed the three ways to
  /// start beside its own run, asking the teacher to start what was running.
  it("is not waiting for a plan while one is being written", () => {
    expect(awaitsPlan(lesson(), false)).toBe(true);
    expect(awaitsPlan(lesson(), true)).toBe(false);
    expect(awaitsPlan(null, false)).toBe(false);
  });
});
