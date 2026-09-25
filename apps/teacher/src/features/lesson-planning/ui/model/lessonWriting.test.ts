import { describe, expect, it } from "vitest";

import { lessonWritingFor, type WritingSelection } from "./lessonWriting";
import type { LessonContent } from "../../domain/lessonContent";
import type { LessonDraft } from "../../domain/lessonPlanning";

const lesson = { id: "lesson", topic: "Fractions" } as unknown as LessonDraft;
const content = { blocks: [] } as unknown as LessonContent;
const planning = {
  topic: "Fractions",
  subtopic: null,
  schemeWeekId: "week",
  schemeEntryId: "entry", classworkComplete: false,
};
const nothing: WritingSelection = { writing: null, planning: null };

describe("which way of writing is on screen", () => {
  it("is none of them when nothing is being written and no lesson is open", () => {
    expect(lessonWritingFor(nothing, null, null)).toBeNull();
  });

  it("offers the start choices when the teacher asked how to begin", () => {
    expect(lessonWritingFor({ ...nothing, writing: { kind: "choices" } }, null, null)).toEqual({
      kind: "choices",
    });
  });

  it("carries the week's entry onto a blank page written for it", () => {
    const writing = lessonWritingFor({ writing: { kind: "blank" }, planning }, null, null);
    expect(writing).toEqual({ kind: "blank", forEntry: planning });
  });

  it("writes a blank page for no entry when the teacher started from nothing", () => {
    expect(lessonWritingFor({ ...nothing, writing: { kind: "blank" } }, null, null)).toEqual({
      kind: "blank",
      forEntry: null,
    });
  });

  it("reads back a hand-written lesson when nothing else is being written", () => {
    expect(lessonWritingFor(nothing, lesson, content)).toEqual({
      kind: "authored",
      lesson,
      content,
    });
  });

  it("lets the editor win over reading back, because asking to edit is editing", () => {
    const editor = { kind: "edit", lesson } as const;
    expect(lessonWritingFor({ ...nothing, writing: { kind: "editor", editor } }, lesson, content))
      .toEqual({ kind: "editor", editor });
  });

  it("reads back nothing for a lesson that was never written by hand", () => {
    expect(lessonWritingFor(nothing, lesson, null)).toBeNull();
  });
});
