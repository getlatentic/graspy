import { Button, InlineNotification } from "@carbon/react";
import type { ReactNode, SVGProps } from "react";

import { eyebrow } from "../../../ui/chrome";
import { lessonsHeadline, workspaceLessons } from "../domain/lessonPlanning";
import { displayTitle, editorWorkspace, headingIntro, workspaceHeading } from "./lessonChrome";
import { LessonList } from "./LessonList";
import { useLessonsWorkspace } from "./useLessonsWorkspace";
import { PlanExportNotice } from "./PlanExportNotice";

/**
 * The teacher's week: what they are teaching, the lessons in it, and the one
 * they are reading.
 *
 * A screen of the workspace, and a parent in its own right — its parts are
 * written as children so the week reads as its own arrangement rather than as
 * ninety lines of markup that happen to be in that order.
 */
export function Week({ children }: { readonly children: ReactNode }) {
  const { shownWorkspace } = useLessonsWorkspace();
  if (shownWorkspace !== "week") return null;
  return <div className={editorWorkspace}>{children}</div>;
}

function NewLessonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width={16} height={16} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
      <path d="M17 15V8h-2v7H8v2h7v7h2v-7h7v-2z" />
    </svg>
  );
}

/** What the teacher is teaching this week, and the way to add to it. */
function WeekHeader() {
  const { snapshot, currentWeek, screen } = useLessonsWorkspace();
  if (!snapshot) return null;
  const headline = lessonsHeadline(snapshot.lessons, currentWeek);
  return (
    <header className={workspaceHeading}>
      <div>
        <p className={eyebrow}>Lessons</p>
        <h1 className={displayTitle}>{headline.title}</h1>
        <p className={headingIntro}>{headline.subtitle}</p>
      </div>
      <Button renderIcon={NewLessonIcon} onClick={screen.chooseStart}>
        New lesson
      </Button>
    </header>
  );
}

/**
 * What went wrong, if anything did.
 *
 * A failed action and a failed export are separate things a teacher may need
 * to act on, so both can be on screen at once rather than one hiding the other.
 */
function WeekNotices() {
  const { actionError, planExport } = useLessonsWorkspace();
  return (
    <>
      {actionError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Lesson not updated"
          subtitle={actionError}
        />
      ) : null}
      <PlanExportNotice state={planExport.state} onDismiss={planExport.dismiss} />
    </>
  );
}

/** The week beside the lesson: a list to choose from, and the one being read. */
function WeekGrid({ children }: { readonly children: ReactNode }) {
  return (
    <div className="mt-lg grid min-w-0 gap-lg border-t border-rule pt-lg min-[60rem]:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
      {children}
    </div>
  );
}

/**
 * The week's lessons, and what choosing one does.
 *
 * An entry with no lesson yet is not opened but planned — there is nothing to
 * load until the teacher decides how to start it.
 */
function WeekLessons() {
  const { snapshot, selectedLesson, planning, currentWeek, screen, controller } =
    useLessonsWorkspace();
  if (!snapshot) return null;
  // The scheme is what commits the teacher to teach, so the week lists its
  // entries whether or not a plan has been written for them yet.
  const listed = workspaceLessons(snapshot.lessons, snapshot.availableSchemeEntries);
  return (
    <LessonList
      lessons={listed}
      currentWeek={currentWeek}
      selectedLessonId={selectedLesson?.id ?? null}
      planningKey={planning?.key ?? null}
      onSelect={(lesson) => {
        if (lesson.lessonId) {
          screen.openLesson();
          void controller.load(lesson.lessonId);
        } else {
          screen.planEntry(lesson);
        }
      }}
    />
  );
}

Week.Header = WeekHeader;
Week.Notices = WeekNotices;
Week.Grid = WeekGrid;
Week.Lessons = WeekLessons;
