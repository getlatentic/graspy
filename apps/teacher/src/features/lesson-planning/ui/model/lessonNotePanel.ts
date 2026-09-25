import { noteMatchesLesson } from "../../domain/studentNote";
import type { LessonDraft, StudentNote } from "../../domain/lessonPlanning";

/** What the screen knows about a note being written for one lesson. */
export interface NoteProgress {
  readonly status: "idle" | "generating" | "failed";
  readonly note: StudentNote | null;
  readonly message: string | null;
}

/** What the note panel shows, apart from the button it offers. */
export interface NotePanel {
  readonly note: StudentNote | null;
  readonly hasPlan: boolean;
  readonly generating: boolean;
  readonly error: string | null;
  readonly stale: boolean;
}

/**
 * What to show for a lesson's note.
 *
 * A note just written is the one to read; failing that, the one saved with the
 * lesson. Writing shows as in progress whether this screen started it or a run
 * already going elsewhere did, because to a teacher it is the same note being
 * written either way. A failure is only a failure while the run that failed is
 * the last thing that happened.
 *
 * There is nothing to write from until the lesson has a plan, which is what
 * `hasPlan` says — the panel offers the button, this decides whether it can do
 * anything.
 *
 * `stale` reports on the note actually shown: confirming an edited lesson leaves
 * the note it was written from behind, and a teacher reading it deserves to know
 * it no longer follows the plan.
 */
export function notePanelFor(
  lesson: LessonDraft,
  progress: NoteProgress,
  writingElsewhere: boolean,
): NotePanel {
  const note = progress.note ?? lesson.studentNote ?? null;
  return {
    note,
    hasPlan: lesson.steps.length > 0,
    generating: progress.status === "generating" || writingElsewhere,
    error: progress.status === "failed" ? progress.message : null,
    stale: note !== null && !noteMatchesLesson(note, lesson.latestVersionNumber),
  };
}
