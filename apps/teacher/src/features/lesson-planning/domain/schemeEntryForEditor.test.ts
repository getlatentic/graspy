import { describe, expect, it } from "vitest";

import { schemeEntryForEditor } from "./schemeEntryForEditor";
import type { LessonDraft, LessonSchemeEntryOption } from "./lessonPlanning";

const entries = [
  { weekId: "week-1", entryId: "entry-1", topic: "Fractions" },
  { weekId: "week-2", entryId: "entry-2", topic: "Decimals" },
] as unknown as LessonSchemeEntryOption[];

const lesson = (schemeWeekId: string | null, schemeEntryId: string | null) =>
  ({ schemeWeekId, schemeEntryId }) as unknown as LessonDraft;

describe("the weekly plan an editor belongs to", () => {
  it("finds the plan a new lesson was launched from", () => {
    const found = schemeEntryForEditor(
      { kind: "new", launch: { schemeWeekId: "week-2", schemeEntryId: "entry-2" } },
      entries,
    );
    expect(found.entry?.entryId).toBe("entry-2");
    expect(found.missing).toBe(false);
  });

  it("finds the plan an edited lesson sits on", () => {
    const found = schemeEntryForEditor({ kind: "edit", lesson: lesson("week-1", "entry-1") }, entries);
    expect(found.entry?.entryId).toBe("entry-1");
  });

  /// A lesson written from nothing belongs to no week, which is not the same as
  /// belonging to one that has gone.
  it("asks for no plan when the lesson was written from nothing", () => {
    expect(schemeEntryForEditor({ kind: "new", launch: null }, entries)).toEqual({
      entry: null,
      missing: false,
    });
    expect(schemeEntryForEditor({ kind: "edit", lesson: lesson(null, null) }, entries)).toEqual({
      entry: null,
      missing: false,
    });
    expect(schemeEntryForEditor(null, entries)).toEqual({ entry: null, missing: false });
  });

  /// This is what replaces the editor with an explanation: the teacher named a
  /// plan that this class and term no longer holds.
  it("reports a plan that is asked for and gone", () => {
    const found = schemeEntryForEditor(
      { kind: "edit", lesson: lesson("week-9", "entry-9") },
      entries,
    );
    expect(found.entry).toBeNull();
    expect(found.missing).toBe(true);
  });

  /// Both halves must match: an entry from another week is not this one.
  it("does not accept an entry that belongs to a different week", () => {
    const found = schemeEntryForEditor(
      { kind: "new", launch: { schemeWeekId: "week-1", schemeEntryId: "entry-2" } },
      entries,
    );
    expect(found.missing).toBe(true);
  });
});
