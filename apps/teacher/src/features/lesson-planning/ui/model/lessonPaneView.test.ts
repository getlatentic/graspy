import { describe, expect, it } from "vitest";

import { lessonPaneView, type LessonPaneState } from "./lessonPaneView";
import type { LessonPaneWork } from "./lessonPaneWork";
import type { LessonDraft, WorkspaceLesson } from "../../domain/lessonPlanning";
import type { LessonPreparationState } from "../../domain/lessonPreparation";

function lesson(overrides: Partial<LessonDraft> = {}): LessonDraft {
  return {
    id: "lesson",
    status: "draft",
    steps: [],
    learningGoals: [],
    preparation: null,
    granularRecord: null,
    ...overrides,
  } as unknown as LessonDraft;
}

const record = { plan: {} };
const planned = lesson({ steps: [{}] as never });
const prepared = lesson({ granularRecord: record as never, steps: [{}] as never });
const openWork: LessonPaneWork = { kind: "classwork", lessonId: "lesson" };
const weekEntry = { key: "entry", topic: "Fractions" } as unknown as WorkspaceLesson;
const running: LessonPreparationState = { status: "preparing", lessonId: "lesson", progress: [] };
const failed: LessonPreparationState = {
  status: "failed",
  lessonId: "lesson",
  message: "The model stopped.",
};

const nothing: LessonPaneState = {
  openWork: null,
  planningEntry: null,
  lesson: null,
  preparation: null,
};

const view = (over: Partial<LessonPaneState>) => lessonPaneView({ ...nothing, ...over });

describe("which screen the lesson pane shows", () => {
  it("offers the ways to start when nothing is chosen", () => {
    expect(view({})).toEqual({ kind: "nothingChosen" });
  });

  it("shows the lesson when one is chosen and written", () => {
    expect(view({ lesson: planned })).toEqual({ kind: "lesson", lesson: planned });
  });

  it("carries the record into the review, so the review cannot exist without it", () => {
    const shown = view({ lesson: prepared });
    expect(shown.kind).toBe("review");
    if (shown.kind === "review") expect(shown.record).toBe(record);
  });

  it("shows a chosen lesson with no plan the ways to start one", () => {
    const bare = lesson();
    expect(view({ lesson: bare })).toEqual({ kind: "lessonNeedsPlan", lesson: bare });
  });

  it("shows a week's entry with no lesson its own ways to start", () => {
    expect(view({ planningEntry: weekEntry, lesson: planned })).toEqual({
      kind: "planningEntry",
      entry: weekEntry,
    });
  });

  it("puts an open screen in front of everything behind it", () => {
    expect(view({ openWork, planningEntry: weekEntry, lesson: prepared })).toEqual({
      kind: "work",
      work: openWork,
    });
  });

  it("lets a run lead the lesson it is writing, carrying the run", () => {
    expect(view({ lesson: planned, preparation: running })).toEqual({
      kind: "preparing",
      lesson: planned,
      run: running,
    });
  });

  it("still offers the ways to start when a run failed and left no plan", () => {
    const bare = lesson();
    expect(view({ lesson: bare, preparation: failed })).toEqual({
      kind: "lessonNeedsPlan",
      lesson: bare,
    });
  });

  it("keeps a lesson being prepared out of the ways-to-start screen", () => {
    expect(view({ lesson: lesson(), preparation: running }).kind).toBe("preparing");
  });

  it("always has something to show", () => {
    const every: LessonPaneState[] = [
      nothing,
      { ...nothing, lesson: lesson() },
      { ...nothing, lesson: planned },
      { ...nothing, lesson: prepared },
      { ...nothing, planningEntry: weekEntry },
      { ...nothing, openWork },
    ];
    for (const state of every) expect(lessonPaneView(state).kind).toBeTruthy();
  });
});
