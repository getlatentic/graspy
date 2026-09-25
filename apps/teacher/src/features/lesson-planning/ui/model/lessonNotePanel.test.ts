import { describe, expect, it } from "vitest";

import { notePanelFor, type NoteProgress } from "./lessonNotePanel";
import type { LessonDraft, StudentNote } from "../../domain/lessonPlanning";

const CONFIRMED_VERSION = 4;

function noteFrom(writtenFromVersion: number): StudentNote {
  return { paragraphs: ["Green plants make their own food in their leaves."], writtenFromVersion };
}

const saved = noteFrom(CONFIRMED_VERSION);
const written = noteFrom(CONFIRMED_VERSION);

function lesson(overrides: Partial<LessonDraft> = {}): LessonDraft {
  return {
    id: "lesson",
    steps: [],
    studentNote: null,
    latestVersionNumber: CONFIRMED_VERSION,
    ...overrides,
  } as unknown as LessonDraft;
}

const idle: NoteProgress = { status: "idle", note: null, message: null };

describe("what to show for a lesson's note", () => {
  it("shows the note saved with the lesson when nothing has been written since", () => {
    expect(notePanelFor(lesson({ studentNote: saved }), idle, false).note).toBe(saved);
  });

  it("shows a note just written in place of the saved one", () => {
    const panel = notePanelFor(lesson({ studentNote: saved }), { ...idle, note: written }, false);
    expect(panel.note).toBe(written);
  });

  it("has nothing to write from until the lesson has a plan", () => {
    expect(notePanelFor(lesson(), idle, false).hasPlan).toBe(false);
    expect(notePanelFor(lesson({ steps: [{}] as never }), idle, false).hasPlan).toBe(true);
  });

  it("is writing when this screen started it", () => {
    expect(notePanelFor(lesson(), { ...idle, status: "generating" }, false).generating).toBe(true);
  });

  it("is writing when a run started elsewhere is doing it", () => {
    expect(notePanelFor(lesson(), idle, true).generating).toBe(true);
  });

  it("reports the failure that just happened", () => {
    const panel = notePanelFor(lesson(), { status: "failed", note: null, message: "No plan" }, false);
    expect(panel.error).toBe("No plan");
  });

  it("reports no failure while a note is being written again", () => {
    const panel = notePanelFor(lesson(), { status: "generating", note: null, message: "No plan" }, false);
    expect(panel.error).toBeNull();
    expect(panel.generating).toBe(true);
  });
});

describe("whether the note still follows the lesson", () => {
  it("leaves a note written from the lesson as it stands unmarked", () => {
    expect(notePanelFor(lesson({ studentNote: saved }), idle, false).stale).toBe(false);
  });

  it("marks a note the lesson has been edited past", () => {
    const edited = lesson({ studentNote: noteFrom(CONFIRMED_VERSION - 1) });
    expect(notePanelFor(edited, idle, false).stale).toBe(true);
  });

  it("has no note to mark when none has been written", () => {
    expect(notePanelFor(lesson(), idle, false).stale).toBe(false);
  });

  it("marks the note it shows, not the one it replaced", () => {
    const edited = lesson({ studentNote: noteFrom(CONFIRMED_VERSION - 1) });
    expect(notePanelFor(edited, { ...idle, note: written }, false).stale).toBe(false);
  });
});
