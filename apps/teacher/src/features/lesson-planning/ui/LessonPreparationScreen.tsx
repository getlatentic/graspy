import { Button, InlineNotification } from "@carbon/react";

import { PreparationNarration } from "./PreparationNarration";
import type { LessonPreparationState } from "./useLessonPreparation";
import { displayTitle, editorWorkspace, headingIntro, workspaceHeading } from "./lessonChrome";
import { eyebrow } from "../../../ui/chrome";

/**
 * Writing a lesson is what the screen is about while it happens.
 *
 * It used to narrate itself in a panel under the lesson, where the step list
 * and the lesson's own actions competed for the same space and the teacher read
 * an empty plan above the run that was filling it. Taking the whole screen
 * fixed that and broke something else: the task bar says the work carries on
 * elsewhere while the screen removed everywhere else to be. It replaces the
 * lesson in its pane instead, so the week stays reachable and the promise
 * holds. How it ends — stopped, or failed with a reason — is answered here too,
 * because that is where the teacher is standing when it happens.
 */
export function LessonPreparationScreen({
  topic,
  weekOrdinal,
  state,
  onBackToWeek,
  onStop,
  onPrepareAgain,
}: {
  readonly topic: string;
  readonly weekOrdinal: number | null;
  readonly state: LessonPreparationState;
  /// Absent when the lesson list is beside this, where a button back to a list
  /// already on screen is one more thing to read and nothing to do.
  readonly onBackToWeek?: () => void;
  readonly onStop: () => void;
  readonly onPrepareAgain: () => void;
}) {
  return (
    <div className={editorWorkspace}>
      <header className={workspaceHeading}>
        <div>
          <p className={eyebrow}>
            {state.status === "preparing" ? "Preparing" : "Not prepared"}
          </p>
          <h1 className={displayTitle}>{topic}</h1>
          {weekOrdinal ? <p className={headingIntro}>Week {weekOrdinal}</p> : null}
        </div>
        {onBackToWeek ? (
          <Button kind="ghost" onClick={onBackToWeek}>
            Back to lessons
          </Button>
        ) : null}
      </header>

      {state.status === "preparing" ? (
        <PreparationNarration progress={state.progress} onCancel={onStop} />
      ) : null}

      {state.status === "failed" ? (
        <section className="grid max-w-[68ch] gap-md">
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Lesson not prepared"
            subtitle={state.message}
          />
          <div className="flex flex-wrap gap-sm">
            <Button onClick={onPrepareAgain}>Try again</Button>
            {onBackToWeek ? (
              <Button kind="ghost" onClick={onBackToWeek}>
                Back to lessons
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {state.status === "cancelled" ? (
        <section className="grid max-w-[68ch] gap-md">
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title="Preparation stopped"
            subtitle="Nothing was changed. The lesson is as you left it."
          />
          <div className="flex flex-wrap gap-sm">
            <Button onClick={onPrepareAgain}>Prepare again</Button>
            {onBackToWeek ? (
              <Button kind="ghost" onClick={onBackToWeek}>
                Back to lessons
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
