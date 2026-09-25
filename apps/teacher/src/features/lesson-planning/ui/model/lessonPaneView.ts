import type { GranularLessonRecord } from "../../domain/granularLesson";
import type { LessonPaneWork } from "./lessonPaneWork";
import type { LessonDraft, WorkspaceLesson } from "../../domain/lessonPlanning";
import type { LessonPreparationState } from "../../domain/lessonPreparation";
import { awaitsPlan, granularRecordOf } from "../../domain/lessonReadiness";

/**
 * Which of the pane's screens is on show, carrying what that screen needs.
 *
 * Exactly one, always — `nothingChosen` is the answer when nothing else is, so
 * there is no state in which the pane has nothing to say. Each variant carries
 * its branch's data, so a screen never re-checks what winning already proved:
 * the review cannot exist without its record, nor the run without its lesson.
 */
export type LessonPaneView =
  | { readonly kind: "work"; readonly work: LessonPaneWork }
  | { readonly kind: "planningEntry"; readonly entry: WorkspaceLesson }
  | { readonly kind: "lessonNeedsPlan"; readonly lesson: LessonDraft }
  | {
      readonly kind: "preparing";
      readonly lesson: LessonDraft;
      readonly run: LessonPreparationState;
    }
  | {
      readonly kind: "review";
      readonly lesson: LessonDraft;
      readonly record: GranularLessonRecord;
    }
  | { readonly kind: "lesson"; readonly lesson: LessonDraft }
  | { readonly kind: "nothingChosen" };

/** What the pane is deciding between, as the screen holds it. */
export interface LessonPaneState {
  /** A deeper screen — classwork, group classwork, class results — open now. */
  readonly openWork: LessonPaneWork | null;
  /** A teaching week's entry with no lesson written for it yet. */
  readonly planningEntry: WorkspaceLesson | null;
  readonly lesson: LessonDraft | null;
  /** The run preparing this lesson, as the screen watches it. */
  readonly preparation: LessonPreparationState | null;
}

/**
 * The one decision behind the pane, in the order that settles it.
 *
 * An open screen sits in front of the lesson behind it. An entry being planned
 * is not yet a lesson, and neither is a lesson with no plan written — those are
 * two screens because what a teacher starts from differs, a week's topic in one
 * case and their own goals in the other. A run leads whatever it is writing —
 * but a run that failed does not: the lesson still has no plan, which is what
 * the teacher must act on. A prepared plan is read before the lesson it will
 * become.
 */
export function lessonPaneView(state: LessonPaneState): LessonPaneView {
  if (state.openWork) return { kind: "work", work: state.openWork };
  if (state.planningEntry) return { kind: "planningEntry", entry: state.planningEntry };
  const { lesson, preparation } = state;
  if (lesson) {
    if (awaitsPlan(lesson, preparation?.status === "preparing")) {
      return { kind: "lessonNeedsPlan", lesson };
    }
    if (preparation && preparation.status !== "idle") {
      return { kind: "preparing", lesson, run: preparation };
    }
    const record = granularRecordOf(lesson);
    if (record) return { kind: "review", lesson, record };
    return { kind: "lesson", lesson };
  }
  return { kind: "nothingChosen" };
}
