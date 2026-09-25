import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import { LessonStartRoutes } from "./LessonStartRoutes";
import { displayTitle, editorWorkspace, headingIntro, workspaceHeading } from "./lessonChrome";
import { eyebrow } from "../../../ui/chrome";

interface Props {
  readonly academicContext: ActiveAcademicContext;
  readonly onStartBlank: () => void;
  readonly onDraftWithGraspy: () => void;
  readonly onBringYourOwn: () => void;
  readonly onCancel: () => void;
}

/**
 * The three ways to start a lesson, offered as a choice rather than assumed,
 * when a teacher deliberately starts a new one while another lesson is open.
 *
 * A teacher who wants to write the lesson themselves should not have to run a
 * generation first and edit its output; one who wants graspy to draft it should
 * not wade through a form. Each route says what it does, and the teacher picks
 * before any screen commits them to one.
 */
export function LessonStartChooser({
  academicContext,
  onStartBlank,
  onDraftWithGraspy,
  onBringYourOwn,
  onCancel,
}: Props) {
  return (
    <div className={editorWorkspace}>
      <header className={workspaceHeading}>
        <div>
          <p className={eyebrow}>New lesson</p>
          <h1 className={displayTitle}>How do you want to start?</h1>
          <p className={headingIntro}>
            {academicContext.assignment.displayName} · {academicContext.sessionLabel} ·{" "}
            {academicContext.period.name}
          </p>
        </div>
      </header>

      <LessonStartRoutes
        onStartBlank={onStartBlank}
        onDraftWithGraspy={onDraftWithGraspy}
        onBringYourOwn={onBringYourOwn}
      />

      <div>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[2.75rem] px-md text-brand font-semibold hover:bg-paper-soft rounded-[10px]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
