import { Button, InlineLoading, InlineNotification } from "@carbon/react";
import type { ReactNode } from "react";

import { describeProgress } from "../../background-tasks/domain/backgroundTask";
import { ClassworkExportDialog } from "../../document-export/ui/ClassworkExportDialog";
import { LessonProgress } from "../../lesson-planning/ui/LessonProgress";
import { CreationProgress } from "./CreationProgress";
import { useClasswork } from "./useClasswork";
import { ClassworkDocument } from "./ClassworkDocument";
import { LessonFollowUps } from "./LessonFollowUps";

/** The store has not answered yet. */
export function ClassworkLoading() {
  const { shown } = useClasswork();
  if (shown !== "loading") return null;
  return (
    <div className="grid gap-lg p-xl">
      <InlineLoading description="Opening the classwork" status="active" />
    </div>
  );
}

/** The store could not answer, with the one thing to do about it. */
export function ClassworkFailed() {
  const { shown, controller } = useClasswork();
  const state = controller.state;
  if (shown !== "failed" || state.status !== "failed") return null;
  return (
    <div className="grid gap-lg p-xl">
      <InlineNotification
        kind="error"
        lowContrast
        hideCloseButton
        title="Classwork unavailable"
        subtitle={state.message}
      />
      <Button kind="tertiary" onClick={() => void controller.load()}>
        Try again
      </Button>
    </div>
  );
}

/**
 * The lesson's classwork: what has been made, and what is still being made.
 *
 * A screen of the workspace and a parent in its own right, so what the page is
 * made of reads as its own arrangement.
 */
export function Classwork({ children }: { readonly children: ReactNode }) {
  const { shown } = useClasswork();
  if (shown !== "classwork") return null;
  return (
    <div className="min-w-0 [&_.cds--btn]:whitespace-nowrap print:m-0 print:block print:min-h-0 print:w-full print:border-0 print:p-0 print:bg-paper print:text-ink [&_.cds--inline-notification]:print:hidden">
      {children}
    </div>
  );
}

/** Which lesson this classwork belongs to, and the way back to it. */
function ClassworkHeader() {
  const { snapshot, generating, onBack } = useClasswork();
  if (!snapshot) return null;
  return (
    <header className="mb-xl flex min-w-0 flex-col items-start gap-md sm:flex-row sm:justify-between print:hidden">
      <div>
        <p className="m-0 mb-xs font-bold text-ink-secondary">Classwork</p>
        <h1 className="m-0 min-w-0 font-display font-extrabold tracking-[-0.03em] text-ink [overflow-wrap:anywhere]">{snapshot.lesson.topic}</h1>
        <p className="m-0 text-ink-secondary">{snapshot.lesson.subject} · {snapshot.lesson.grade}</p>
      </div>
      <div className="flex flex-wrap gap-xs">
        {/* The lesson is still on screen beside this, so leaving returns to
            it rather than claiming to leave lessons altogether. */}
        <Button kind="ghost" disabled={generating} onClick={onBack}>
          Back to the lesson
        </Button>
      </div>
    </header>
  );
}

/**
 * The same strip the lesson carries.
 *
 * Reaching this screen is the third step of one job, and showing the whole of
 * it here is what stops the arrival reading as a new place. Classwork is only
 * reached from a confirmed lesson, so the first two steps are behind the
 * teacher.
 */
function ClassworkProgress() {
  const { complete } = useClasswork();
  return (
    <div className="mb-lg print:hidden">
      <LessonProgress status="confirmed" hasPlan classworkWritten={complete} />
    </div>
  );
}

/** What went wrong with the last action, if anything did. */
function ClassworkNotices() {
  const { actionError } = useClasswork();
  if (!actionError) return null;
  return (
    <InlineNotification
      kind="error"
      lowContrast
      hideCloseButton
      title="Classwork not updated"
      subtitle={actionError}
    />
  );
}

/**
 * The sheet the classwork is made and read on.
 *
 * Stacked rather than a column of its own: the week's lessons already hold the
 * left of the screen, and a second rail beside them is what made this read as
 * somewhere else rather than as this lesson's next step.
 */
function ClassworkSheet({ children }: { readonly children: ReactNode }) {
  return (
    <div className="grid min-w-0 border-y border-rule-strong bg-paper text-ink print:m-0 print:block print:min-h-0 print:w-full print:border-0 print:p-0">
      {children}
    </div>
  );
}

/** Making the classwork: starting, stopping, and what is happening now. */
function ClassworkCreation() {
  const { run, underWay, controller } = useClasswork();
  return (
    <CreationProgress
      run={run}
      queued={underWay?.status === "queued"}
      working={controller.active}
      waitingMessage={underWay ? describeProgress(underWay) : ""}
      onStart={() => void controller.start()}
      onStop={controller.cancel}
      onResume={controller.resume}
      onRetrySection={(sectionId) => void controller.retry(sectionId)}
    />
  );
}

/** Where what has been made is read. */
function ClassworkWritten({ children }: { readonly children: ReactNode }) {
  return (
    <section
      className="grid min-w-0 content-start gap-2xl px-md pt-lg pb-2xl sm:p-xl print:m-0 print:block print:w-full print:border-0 print:p-0"
      aria-label="The classwork you created"
    >
      {children}
    </section>
  );
}

/** What the lesson is for, kept in view while its classwork is read. */
function ClassworkGoals() {
  const { snapshot } = useClasswork();
  if (!snapshot) return null;
  return (
    <div className="w-[min(100%,70ch)] print:hidden [&_h2]:m-0 [&_h2]:min-w-0 [&_h2]:font-display [&_h2]:text-md [&_h2]:font-extrabold [&_h2]:tracking-[-0.03em] [&_h2]:text-ink [&_ol]:mt-sm [&_ol]:mb-0 [&_ol]:grid [&_ol]:list-none [&_ol]:gap-xs [&_ol]:p-0 [&_ol]:leading-body [&_ol]:text-ink-secondary">
      <h2>Learning goals</h2>
      <ol>
        {snapshot.lesson.learningGoals.map((goal, index) => (
          <li key={goal}><b>{index + 1}.</b> {goal}</li>
        ))}
      </ol>
    </div>
  );
}

/** The classwork itself, once any of it is saved. */
function ClassworkDocumentScreen() {
  const { hasSavedSections, snapshot, context, gateway, lessonId, exportGateway, controller } =
    useClasswork();
  if (!hasSavedSections || !snapshot) return null;
  return (
    <ClassworkDocument
      context={context}
      gateway={gateway}
      lessonId={lessonId}
      snapshot={snapshot}
      exportGateway={exportGateway}
      onEditBlock={controller.editBlock}
      onApprove={controller.approveVersion}
      onCancelRegeneration={controller.cancel}
      onGetSectionHistory={controller.getSectionHistory}
      onRecreateSection={controller.recreateSection}
      onRestoreSection={controller.restoreSection}
    />
  );
}

/** What this page will hold, before anything has been made for it. */
function ClassworkNotWrittenYet() {
  const { hasSavedSections } = useClasswork();
  if (hasSavedSections) return null;
  return (
    <div className="max-w-[42rem] self-center py-3xl [&_h2]:m-0 [&_h2]:min-w-0 [&_h2]:font-display [&_h2]:font-extrabold [&_h2]:tracking-[-0.03em] [&_h2]:text-ink [&_p]:leading-body [&_p]:text-ink-secondary">
      <h2>Build from the lesson you confirmed.</h2>
      <p>Completed sections appear here as they are saved, so progress is never lost.</p>
    </div>
  );
}

/** Where the finished classwork leads: printing, and a version per group. */
function ClassworkFollowUps() {
  const { complete, snapshot, context, exportGateway, lessonId, onOpenGroupClasswork } =
    useClasswork();
  if (!complete) return null;
  const printable = (initialCopy: "student" | "teacher", label: string) =>
    exportGateway ? (
      <ClassworkExportDialog
        context={context}
        gateway={exportGateway}
        lessonId={lessonId}
        classworkSet="original"
        initialCopy={initialCopy}
        label={label}
      />
    ) : null;
  return (
    <LessonFollowUps
      approved={snapshot?.run?.documentVersion?.status === "approved"}
      printForPupils={printable("student", "Print for pupils")}
      printWithAnswers={printable("teacher", "Print with answers")}
      onOpenGroupClasswork={onOpenGroupClasswork}
    />
  );
}

Classwork.Header = ClassworkHeader;
Classwork.Progress = ClassworkProgress;
Classwork.Notices = ClassworkNotices;
Classwork.Sheet = ClassworkSheet;
Classwork.Creation = ClassworkCreation;
Classwork.Made = ClassworkWritten;
Classwork.Goals = ClassworkGoals;
Classwork.Document = ClassworkDocumentScreen;
Classwork.NotMadeYet = ClassworkNotWrittenYet;
Classwork.FollowUps = ClassworkFollowUps;
