import { describe, expect, it, vi } from "vitest";

import { lessonAuthoring, type AuthoringStore } from "./lessonAuthoring";
import type { LessonToDraft } from "../domain/lessonDrafting";
import type { LessonWorkspaceSnapshot } from "../domain/lessonPlanning";

const workspaceWith = (...ids: string[]) =>
  ({ lessons: ids.map((id) => ({ id })) }) as unknown as LessonWorkspaceSnapshot;

const before = workspaceWith("known");

function store(overrides: Partial<AuthoringStore> = {}) {
  return {
    snapshot: before,
    saveDraft: vi.fn().mockResolvedValue(workspaceWith("known", "written")),
    saveAuthoredLesson: vi.fn().mockResolvedValue(true),
    ...overrides,
  } satisfies AuthoringStore;
}

const entry: LessonToDraft = {
  lessonId: null,
  schemeWeekId: "week",
  schemeEntryId: "entry",
  topic: "Fractions",
  subtopic: null,
  learningGoals: ["Compare two fractions."],
  instructionalMaterials: [],
  assessment: [],
};

describe("drafting with graspy", () => {
  it("finds the lesson a save created, which had no identity before it", async () => {
    const outcome = await lessonAuthoring(store()).draftWithGraspy(entry);
    expect(outcome).toEqual({ kind: "saved", lessonId: "written", isNew: true });
  });

  it("reports a lesson that already exists without saving again", async () => {
    const deps = store();
    const outcome = await lessonAuthoring(deps).draftWithGraspy({ ...entry, lessonId: "already" });
    expect(outcome).toEqual({ kind: "saved", lessonId: "already", isNew: false });
    expect(deps.saveDraft).not.toHaveBeenCalled();
  });

  it("refuses when the save is refused", async () => {
    const deps = store({ saveDraft: vi.fn().mockResolvedValue(null) });
    expect(await lessonAuthoring(deps).draftWithGraspy(entry)).toEqual({ kind: "refused" });
  });

  it("refuses when the save reports no lesson that was not there before", async () => {
    const deps = store({ saveDraft: vi.fn().mockResolvedValue(before) });
    expect(await lessonAuthoring(deps).draftWithGraspy(entry)).toEqual({ kind: "refused" });
  });

  it("seeds the new lesson from the week's entry", async () => {
    const deps = store();
    await lessonAuthoring(deps).draftWithGraspy(entry);
    expect(deps.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonId: null,
        schemeWeekId: "week",
        schemeEntryId: "entry",
        topic: "Fractions",
        learningGoals: ["Compare two fractions."],
      }),
    );
  });
});

describe("saving a lesson written by hand", () => {
  it("calls a lesson new when it was saved without an id", async () => {
    const outcome = await lessonAuthoring(store()).saveAuthored({ lessonId: null } as never);
    expect(outcome).toEqual({ kind: "saved", lessonId: null, isNew: true });
  });

  it("calls an edit an edit, not a new lesson", async () => {
    const outcome = await lessonAuthoring(store()).saveAuthored({ lessonId: "already" } as never);
    expect(outcome).toEqual({ kind: "saved", lessonId: "already", isNew: false });
  });

  it("refuses when the save is refused", async () => {
    const deps = store({ saveAuthoredLesson: vi.fn().mockResolvedValue(false) });
    expect(await lessonAuthoring(deps).saveAuthored({ lessonId: null } as never)).toEqual({
      kind: "refused",
    });
  });
});

describe("saving a plan from the editor", () => {
  it("reports the lesson it wrote, so a run can be started on it", async () => {
    const outcome = await lessonAuthoring(store()).savePlan({ lessonId: null } as never);
    expect(outcome).toEqual({ kind: "saved", lessonId: "written", isNew: true });
  });

  it("keeps the lesson's own id when the editor was editing one", async () => {
    const outcome = await lessonAuthoring(store()).savePlan({ lessonId: "already" } as never);
    expect(outcome).toEqual({ kind: "saved", lessonId: "already", isNew: false });
  });

  it("refuses when the save is refused", async () => {
    const deps = store({ saveDraft: vi.fn().mockResolvedValue(null) });
    expect(await lessonAuthoring(deps).savePlan({ lessonId: null } as never)).toEqual({
      kind: "refused",
    });
  });
});
