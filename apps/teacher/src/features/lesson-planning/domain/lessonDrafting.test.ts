import { describe, expect, it } from "vitest";

import { draftFromLesson, draftFromSchemeEntry } from "./lessonDrafting";
import type { LessonDraft, LessonSchemeEntryOption, WorkspaceLesson } from "./lessonPlanning";

const entry = {
  weekId: "week-1",
  weekOrdinal: 1,
  entryId: "entry-1",
  topic: "Algebra",
  subtopic: "Like terms",
  learningGoals: ["Collect like terms."],
  instructionalMaterials: ["Board"],
  assessment: ["Exit slip"],
} as unknown as LessonSchemeEntryOption;

const opened = {
  schemeWeekId: "week-1",
  schemeEntryId: "entry-1", classworkComplete: false,
  topic: "Algebra",
  subtopic: "Like terms",
} as unknown as WorkspaceLesson;

const lesson = {
  id: "lesson-1",
  schemeWeekId: "week-2",
  schemeEntryId: "entry-2", classworkComplete: false,
  topic: "Fractions",
  subtopic: null,
  learningGoals: ["Order fractions."],
  instructionalMaterials: ["Strips"],
  assessment: ["Quiz"],
} as unknown as LessonDraft;

describe("where a drafted lesson starts from", () => {
  /// The difference that matters: an entry has no lesson yet, so the draft
  /// carries no id and the save is what gives it one.
  it("starts a weekly plan's entry with no lesson identity", () => {
    const draft = draftFromSchemeEntry(opened, entry);
    expect(draft.lessonId).toBeNull();
    expect(draft.schemeEntryId).toBe("entry-1");
    // The goals come from the plan, which is what the entry has and the opened row does not.
    expect(draft.learningGoals).toEqual(["Collect like terms."]);
    expect(draft.assessment).toEqual(["Exit slip"]);
  });

  it("keeps an existing lesson's identity so the draft replaces it", () => {
    const draft = draftFromLesson(lesson);
    expect(draft.lessonId).toBe("lesson-1");
    expect(draft.learningGoals).toEqual(["Order fractions."]);
  });

  /// Both beginnings feed one flow, so both must answer for every field it reads.
  it("answers for the same fields whichever way a lesson begins", () => {
    expect(Object.keys(draftFromSchemeEntry(opened, entry)).sort()).toEqual(
      Object.keys(draftFromLesson(lesson)).sort(),
    );
  });
});
