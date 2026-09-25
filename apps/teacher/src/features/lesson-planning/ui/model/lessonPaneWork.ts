/**
 * The deeper work a lesson opens into: its classwork, the group versions of
 * them, and what the class scored.
 *
 * Each of these used to replace the whole screen, so reaching one read as
 * leaving for somewhere else and coming back meant "Back to lessons". They are
 * stages of one lesson's job, so they open in the lesson's own pane with the
 * week beside them, and this type is what the pane is told to show.
 *
 * One value rather than three ids: only one can be open, and three independent
 * ids made that a rule to remember at every call site instead of a fact about
 * the type.
 */
export type LessonPaneWorkKind = "classwork" | "groupClasswork" | "classResults";

export interface LessonPaneWork {
  readonly kind: LessonPaneWorkKind;
  readonly lessonId: string;
}

/**
 * What backing out of this work returns to, or `null` for the lesson itself.
 *
 * Group classwork is reached from the classwork, so leaving them returns
 * there rather than skipping a step the teacher walked through.
 */
export function afterLeaving(work: LessonPaneWork): LessonPaneWork | null {
  return work.kind === "groupClasswork"
    ? { kind: "classwork", lessonId: work.lessonId }
    : null;
}

/** What the control that leaves this work should say. */
export function leavingLabel(work: LessonPaneWork): string {
  return work.kind === "groupClasswork" ? "Back to the classwork" : "Back to the lesson";
}
