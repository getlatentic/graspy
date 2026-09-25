import type { LessonPaneWorkKind } from "./lessonPaneWork";

/** The documents a lesson carries: the plan, and the note pupils copy. */
export type LessonArtifactTab = "plan" | "note";

/**
 * Where a lesson opens: on one of its artifacts, or in the deeper work.
 *
 * Reaching a lesson from a background task used to land on the plan whatever
 * the task had been doing, so "Open" on a stopped slides build showed the plan
 * and left the teacher to find the build again themselves.
 */
export type LessonOpening =
  | { readonly at: "artifact"; readonly tab: LessonArtifactTab }
  | { readonly at: "work"; readonly work: LessonPaneWorkKind };

/**
 * The token that carries an opening in a link, and back again.
 *
 * A token rather than the task's own kind: these appear in URLs, and the
 * registry's names are the runtime's vocabulary rather than the product's.
 */
export type LessonOpeningToken = "note" | "classwork" | "groupClasswork" | "classResults";

const OPENINGS: Record<LessonOpeningToken, LessonOpening> = {
  note: { at: "artifact", tab: "note" },
  classwork: { at: "work", work: "classwork" },
  groupClasswork: { at: "work", work: "groupClasswork" },
  classResults: { at: "work", work: "classResults" },
};

/**
 * Where the lesson should open for work of this kind, or `null` when the
 * lesson itself is the answer.
 *
 * `lesson_preparation` is that case: a lesson being prepared shows the run in
 * its own pane, so the lesson is already the destination.
 *
 * `classwork` opens the classwork itself: a teacher returning to a
 * classwork run is returning to that screen, and the lesson behind it stays on
 * screen beside it either way.
 */
export function openingForTaskKind(kind: string): LessonOpeningToken | null {
  if (kind === "lesson_note") return "note";
  if (kind === "classwork") return "classwork";
  return kind === "differentiated_classwork" ? "groupClasswork" : null;
}

/** The opening a link asks for, ignoring anything it does not name. */
export function readOpening(token: string | null): LessonOpening | null {
  return token !== null && token in OPENINGS ? OPENINGS[token as LessonOpeningToken] : null;
}

/**
 * Where a lesson lives, so everything that links to one spells it the same way.
 *
 * Two screens were writing this by hand — the running-task bar and the term
 * plan — which is two places for the query name and the escaping to drift.
 */
export function lessonRoute(lessonId: string, opening: LessonOpeningToken | null = null): string {
  const lesson = `/lessons?lesson=${encodeURIComponent(lessonId)}`;
  return opening ? `${lesson}&open=${opening}` : lesson;
}
