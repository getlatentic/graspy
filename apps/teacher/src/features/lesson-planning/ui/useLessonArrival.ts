import { useEffect, useRef } from "react";

import { readOpening, type LessonOpening } from "./model/lessonOpening";
import type { LessonPaneWorkKind } from "./model/lessonPaneWork";
import type { LessonSummary } from "../domain/lessonPlanning";
import { lessonToOpenFirst } from "../domain/lessonToOpenFirst";

interface ArrivalTarget {
  /** The lesson a link named, from the running-task bar. */
  readonly lessonId: string | null;
  /** Where in that lesson the work was, as the link wrote it. */
  readonly openAt: string | null;
  readonly openLesson: () => void;
  readonly openWork: (kind: LessonPaneWorkKind, lessonId: string) => void;
  readonly load: (lessonId: string) => void;
}

/**
 * Opening the lesson a link named, once, at the work the link was about.
 *
 * Once per lesson rather than on every render: the effect runs again whenever
 * the screen re-renders for its own reasons, and re-opening would drag a
 * teacher back off whatever they moved on to.
 */
export function useLessonArrival({
  lessonId,
  openAt,
  openLesson,
  openWork,
  load,
}: ArrivalTarget): LessonOpening | null {
  const opening = readOpening(openAt);
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!lessonId || opened.current === lessonId) return;
    opened.current = lessonId;
    openLesson();
    if (opening?.at === "work") openWork(opening.work, lessonId);
    load(lessonId);
    // The callbacks are rebuilt every render; the ref is what makes this once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, opening?.at, opening?.at === "work" ? opening.work : null]);
  return opening;
}

interface FirstLessonTarget {
  /** Whether the workspace has finished reading, so there is a list to open from. */
  readonly ready: boolean;
  readonly assignmentId: string;
  readonly lessons: readonly LessonSummary[];
  /** True when something is already on screen that opening a lesson would replace. */
  readonly busy: boolean;
  readonly currentWeekOrdinal: number | null;
  readonly load: (lessonId: string) => void;
}

/**
 * Opening a lesson on arrival, so a teacher lands on their work rather than an
 * empty prompt.
 *
 * Once per class, and only when nothing else is on screen: backing out
 * afterwards is left alone, so this never fights a teacher who wanted the start
 * choices instead. Which lesson that is, `lessonToOpenFirst` decides.
 */
export function useFirstLessonOpened({
  ready,
  assignmentId,
  lessons,
  busy,
  currentWeekOrdinal,
  load,
}: FirstLessonTarget) {
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || busy || openedFor.current === assignmentId) return;
    const opening = lessonToOpenFirst(lessons, currentWeekOrdinal);
    if (!opening) return;
    openedFor.current = assignmentId;
    load(opening.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, busy, assignmentId, lessons, currentWeekOrdinal]);
}


/**
 * Bringing the screen back to work the teacher just started.
 *
 * Building begins from wherever the button was pressed, and for a weekly plan
 * that is a panel well down the page — so the run they started would render
 * above the fold they were looking at. The run leads the screen it appears on.
 *
 * Keyed on which lessons are being written rather than on how far along they
 * are, so a run in progress does not drag the page back on every tick.
 */
export function useScrolledToStartedWork(preparingLessonIds: string) {
  useEffect(() => {
    if (!preparingLessonIds) return;
    window.scrollTo({ top: 0 });
  }, [preparingLessonIds]);
}
