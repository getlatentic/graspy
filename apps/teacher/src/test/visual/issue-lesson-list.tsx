import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import { Button } from "@carbon/react";
import { createRoot } from "react-dom/client";

import { eyebrow } from "../../ui/chrome";
import { LessonList } from "../../features/lesson-planning/ui/LessonList";
import {
  displayTitle,
  headingIntro,
  workspaceHeading,
} from "../../features/lesson-planning/ui/lessonChrome";
import {
  formatCurriculumTitle,
  lessonsHeadline,
  type LessonStatus,
  type WorkspaceLesson,
} from "../../features/lesson-planning/domain/lessonPlanning";

/* The "plenty Week 1" case: one topic, several subtopics, all in Week 1 —
 * rendered through the workspace's own list and chrome, so what this page
 * shows is what a teacher sees rather than a copy of it. */

const planned: readonly (WorkspaceLesson & {
  readonly status: LessonStatus;
  readonly classworkComplete: boolean;
})[] = [
  { key: "1", lessonId: "1", schemeWeekId: null, schemeEntryId: null, topic: "Whole Numbers", subtopic: "Millions", weekOrdinal: 1, status: "confirmed", classworkComplete: true, startedAt: "2026-07-21 13:53:35" },
  { key: "2", lessonId: "2", schemeWeekId: null, schemeEntryId: null, topic: "Whole Numbers", subtopic: "Billions", weekOrdinal: 1, status: "draft", classworkComplete: false, startedAt: "2026-07-24 04:17:18" },
  { key: "3", lessonId: "3", schemeWeekId: null, schemeEntryId: null, topic: "Whole Numbers", subtopic: "Trillions", weekOrdinal: 1, status: "draft", classworkComplete: false, startedAt: "2026-07-30 14:34:14" },
  { key: "4", lessonId: "4", schemeWeekId: null, schemeEntryId: null, topic: "Fractions", subtopic: "Equivalent fractions", weekOrdinal: 4, status: "draft", classworkComplete: false, startedAt: "2026-07-19 13:19:24" },
  /* A topic that is its own single lesson: one row, no heading over it. */
  { key: "5", lessonId: "5", schemeWeekId: null, schemeEntryId: null, topic: "Rounding to the nearest ten", subtopic: null, weekOrdinal: null, status: "draft", classworkComplete: false, startedAt: "2026-07-23 12:47:44" },
  /* Three drafts of one subtopic, no week between them — the owner's own
   * library. Nothing but the hour each was started tells them apart. */
  { key: "6", lessonId: "6", schemeWeekId: null, schemeEntryId: null, topic: "Whole Numbers", subtopic: "Millions", weekOrdinal: null, status: "draft", classworkComplete: false, startedAt: "2026-07-21 13:53:35" },
  { key: "7", lessonId: "7", schemeWeekId: null, schemeEntryId: null, topic: "Whole Numbers", subtopic: "Millions", weekOrdinal: null, status: "draft", classworkComplete: false, startedAt: "2026-07-21 15:11:51" },
  { key: "8", lessonId: "8", schemeWeekId: null, schemeEntryId: null, topic: "Whole Numbers", subtopic: "Millions", weekOrdinal: null, status: "draft", classworkComplete: false, startedAt: "2026-07-21 15:15:26" },
];

/* A scheme entry the teacher has not written a plan for yet — the state the
 * list marks "No plan yet". */
const unplanned: WorkspaceLesson = {
  key: "entry-6",
  lessonId: null,
  schemeWeekId: "week-1",
  schemeEntryId: "entry-6",
  topic: "Whole Numbers",
  subtopic: "Place value to one billion",
  weekOrdinal: 1,
  status: "unplanned",
};

// Exactly as the bundled NERDC scheme stores it — all-caps — through the same
// formatter the workspace applies.
const currentWeek = {
  ordinal: 1,
  title: formatCurriculumTitle("WHOLE NUMBERS COUNTING AND WRITING"),
  standing: "thisWeek",
} as const;
const listed: readonly WorkspaceLesson[] = [...planned, unplanned];
const headline = lessonsHeadline(planned, currentWeek);

export function NewLessonIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width={16} height={16} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
      <path d="M17 15V8h-2v7H8v2h7v7h2v-7h7v-2z" />
    </svg>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("The visual-check root is missing.");
createRoot(root).render(
  <div className="mx-auto w-[min(100%,72rem)] px-lg py-xl">
    <header className={workspaceHeading}>
      <div>
        <p className={eyebrow}>Lessons</p>
        <h1 className={displayTitle}>{headline.title}</h1>
        <p className={headingIntro}>{headline.subtitle}</p>
      </div>
      <Button renderIcon={NewLessonIcon}>New lesson</Button>
    </header>

    {/* The week beside the lesson, as WeekScreen composes it. */}
    <div className="mt-lg grid min-w-0 gap-lg border-t border-rule pt-lg min-[60rem]:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
      <LessonList
        lessons={listed}
        currentWeek={currentWeek}
        selectedLessonId="1"
        planningKey={null}
        onSelect={() => undefined}
      />
      <section aria-live="polite" />
    </div>
  </div>,
);
