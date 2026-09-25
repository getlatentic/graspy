import { useState } from "react";

import type { LessonDraft, LessonLaunch, WorkspaceLesson } from "../domain/lessonPlanning";
import type { LessonPaneWork, LessonPaneWorkKind } from "./model/lessonPaneWork";
import type { EditorState, WritingMode } from "./model/lessonWriting";

export type { EditorState, WritingMode };

/** A lesson just confirmed, held so the screen can offer the next step. */
export interface ConfirmedLesson {
  readonly lessonId: string;
  readonly topic: string;
}

/**
 * What is in front of the teacher on the lessons screen, besides the lessons.
 */
export function useLessonsScreen(launch: LessonLaunch | null) {
  const [writing, setWriting] = useState<WritingMode | null>(() =>
    launch ? { kind: "editor", editor: { kind: "new", launch } } : null,
  );
  const [planning, setPlanning] = useState<WorkspaceLesson | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedLesson | null>(null);
  const [paneWork, setPaneWork] = useState<LessonPaneWork | null>(null);

  return {
    writing,
    planning,
    confirmed,
    paneWork,

    /** Write a lesson from a weekly plan, or from nothing. */
    writeNew: (launchFrom: LessonLaunch | null, mode?: "structured" | "pasted") =>
      setWriting({
        kind: "editor",
        editor: { kind: "new", launch: launchFrom, ...(mode ? { mode } : {}) },
      }),
    /** Open an existing lesson's starting plan for editing. */
    editLesson: (lesson: LessonDraft) => setWriting({ kind: "editor", editor: { kind: "edit", lesson } }),
    /** Offer the three ways to start. */
    chooseStart: () => setWriting({ kind: "choices" }),
    /** Open a blank plan to write into. */
    writeByHand: () => setWriting({ kind: "blank" }),
    /**
     * Back to the week from whatever was being written.
     *
     * One move, where there were three named for what they closed. Closing the
     * editor, cancelling the choices and leaving the blank page were the same
     * transition all along; only the flags made them look different.
     */
    stopWriting: () => setWriting(null),
    /** A lesson written by hand and saved: the blank page and the entry both go. */
    finishWritingByHand: () => {
      setWriting(null);
      setPlanning(null);
    },

    /** Open a scheme entry that has no lesson written for it yet. */
    planEntry: (entry: WorkspaceLesson) => setPlanning(entry),
    /** Open a lesson rather than an entry, so the entry's panel steps aside. */
    openLesson: () => setPlanning(null),

    confirm: (lesson: ConfirmedLesson) => setConfirmed(lesson),
    dismissConfirmation: () => setConfirmed(null),

    /** Open one of the lesson's deeper screens in its pane. */
    openWork: (kind: LessonPaneWorkKind, lessonId: string) =>
      setPaneWork({ kind, lessonId }),
    /** Move between them, or back to the lesson when there is nowhere behind. */
    goToWork: (work: LessonPaneWork | null) => setPaneWork(work),

    /**
     * Whether a lesson is being written, which replaces the week entirely.
     *
     * A lesson written by hand reads back through the same writing screens, so
     * having one counts even when nothing is being written.
     */
    isWritingALesson: (readingAuthoredLesson: boolean) =>
      writing !== null || readingAuthoredLesson,
  };
}
