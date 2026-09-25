import { Button, InlineLoading, InlineNotification } from "@carbon/react";
import type { ReactNode } from "react";

import {
  LessonsWorkspaceProvider,
  type LessonsWorkspaceIngredients,
} from "./LessonsWorkspaceContext";
import { useLessonsWorkspace } from "./useLessonsWorkspace";
import { LessonWritingScreens } from "./LessonWritingScreens";

/**
 * The lessons workspace as the list of what it can be: still reading, unable
 * to read, writing a lesson in place of the week, or the week itself.
 *
 * Each screen answers for itself whether it is the one on, and all answer
 * against the same decision, settled with the values — the same shape as the
 * pane inside it.
 */
export function LessonsView({
  values,
  children,
}: {
  readonly values: LessonsWorkspaceIngredients;
  readonly children: ReactNode;
}) {
  return <LessonsWorkspaceProvider value={values}>{children}</LessonsWorkspaceProvider>;
}

/** The store has not answered yet, so there is nothing truthful to draw. */
function LoadingScreen() {
  const { shownWorkspace } = useLessonsWorkspace();
  if (shownWorkspace !== "loading") return null;
  return (
    <div className={"mx-auto grid min-h-full w-[min(100%-2rem,42rem)] content-center gap-lg"} aria-live="polite">
      <InlineLoading description="Opening lessons" status="active" />
    </div>
  );
}

/** The store could not answer, said once, with the one thing to do about it. */
function FailedScreen() {
  const { shownWorkspace, controller } = useLessonsWorkspace();
  const state = controller.state;
  if (shownWorkspace !== "failed" || state.status !== "failed") return null;
  return (
    <div className={"mx-auto grid min-h-full w-[min(100%-2rem,42rem)] content-center gap-lg"}>
      <InlineNotification
        kind="error"
        lowContrast
        hideCloseButton
        title="Lessons unavailable"
        subtitle={state.message}
      />
      <Button kind="tertiary" onClick={() => void controller.load()}>
        Try again
      </Button>
    </div>
  );
}

/** Writing a lesson, in place of the week rather than inside it. */
function WritingScreen() {
  const {
    shownWorkspace,
    writingScreen,
    snapshot,
    authoring,
    academicContext,
    pendingAction,
    actionError,
    bringingIn,
    controller,
    screen,
  } = useLessonsWorkspace();
  if (shownWorkspace !== "writing") return null;
  if (!writingScreen || !snapshot || !authoring) return null;
  return (
    <LessonWritingScreens
      writing={writingScreen}
      chrome={{
        academicContext,
        saving: pendingAction === "save-draft" || pendingAction === "save-authored-lesson",
        error: actionError,
      }}
      attaching={{ bringingIn, schemeEntries: snapshot.availableSchemeEntries }}
      onCancel={
        // Leaving a hand-written lesson is reopening it, not stopping work:
        // it is saved, so the lesson is what the teacher goes back to.
        writingScreen.kind === "authored" ? () => void controller.load() : screen.stopWriting
      }
      ways={{
        blank: screen.writeByHand,
        draft: () => screen.writeNew(null),
        bringYourOwn: () => screen.writeNew(null, "pasted"),
      }}
      onSave={{ authored: authoring.saveAuthored, draft: authoring.saveDraftedPlan }}
    />
  );
}

LessonsView.Loading = LoadingScreen;
LessonsView.Failed = FailedScreen;
LessonsView.Writing = WritingScreen;
