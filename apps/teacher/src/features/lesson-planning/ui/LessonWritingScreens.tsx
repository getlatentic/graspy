import { Button, InlineNotification } from "@carbon/react";

import { schemeEntryForEditor } from "../domain/schemeEntryForEditor";
import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import type {
  LessonSchemeEntryOption,
  SaveAuthoredLessonRequest,
  SaveLessonDraftRequest,
} from "../domain/lessonPlanning";
import { AuthoredLessonReview } from "./AuthoredLessonReview";
import { LessonEditor } from "./LessonEditor";
import { LessonStartChooser } from "./LessonStartChooser";
import { NewAuthoredLesson } from "./NewAuthoredLesson";
import type { LessonWriting } from "./model/lessonWriting";
import type { WaysToBringInAPlan } from "./useBringingInAPlan";

interface Props {
  readonly writing: LessonWriting;
  /**
   * What every one of these screens shows around itself: whose class it is,
   * whether an action is in flight, and what went wrong last time.
   *
   * `saving` is a name rather than an action id. This component used to ask
   * whether pendingAction equalled "save-draft", which meant a screen for
   * writing lessons knew the strings another layer uses to label its work.
   */
  readonly chrome: {
    readonly academicContext: ActiveAcademicContext;
    readonly saving: boolean;
    readonly error: string | null;
  };
  readonly onCancel: () => void;
  /**
   * The three ways to start, which only the start choices offer.
   *
   * Grouped because they are one question asked three ways, and because loose
   * beside the rest they read as things every screen here might do.
   */
  readonly ways: {
    readonly blank: () => void;
    readonly draft: () => void;
    readonly bringYourOwn: () => void;
  };
  /**
   * What the editor needs to attach a lesson to a weekly plan, and only it.
   *
   * Which plan this lesson belongs to is worked out here rather than passed in.
   * It is derived from the two things already present — what is being written,
   * and the plans available — so the workspace was deriving a value only this
   * screen read, and carrying its failure case as an early return of its own.
   */
  readonly attaching: {
    readonly bringingIn: WaysToBringInAPlan;
    /** The weekly plans a lesson can be attached to while it is edited. */
    readonly schemeEntries: LessonSchemeEntryOption[];
  };
  /** The two ways a lesson is written down: by hand, or as a plan to prepare from. */
  readonly onSave: {
    readonly authored: (request: Omit<SaveAuthoredLessonRequest, "context">) => Promise<boolean>;
    readonly draft: (
      request: Omit<SaveLessonDraftRequest, "context">,
      andPrepare: boolean,
    ) => Promise<boolean>;
  };
}

/**
 * Writing a lesson, in place of the week.
 *
 * A lesson being written is not a lesson being read beside its neighbours: the
 * teacher is composing one thing and the week is not the context for it. That
 * is why these replace the screen rather than opening in the pane, which is the
 * opposite choice from the classwork and the class results — those are the
 * lesson's own later stages, and the week stays beside them.
 *
 * What it does not know: that the screen keeps this state in a hook, that a
 * planning controller exists, or what saving a lesson sets in motion afterwards.
 * It is handed what to show and what to call, so a change to how the workspace
 * holds its state cannot reach in here.
 */
export function LessonWritingScreens({
  writing,
  chrome,
  onCancel,
  ways,
  attaching,
  onSave,
}: Props) {
  const { academicContext, saving, error } = chrome;
  const { entry: attachedPlan, missing: planGone } = schemeEntryForEditor(
    writing.kind === "editor" ? writing.editor : null,
    attaching.schemeEntries,
  );
  if (planGone) {
    return (
      <div className="mx-auto grid min-h-full w-[min(100%-2rem,42rem)] content-center gap-lg">
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Weekly plan unavailable"
          subtitle="This weekly plan is no longer available in the selected class and term. Return to the weekly plan and choose it again."
        />
        <Button kind="tertiary" onClick={onCancel}>
          Back to lessons
        </Button>
      </div>
    );
  }
  if (writing.kind === "choices") {
    return (
      <LessonStartChooser
        academicContext={academicContext}
        onCancel={onCancel}
        onStartBlank={ways.blank}
        onDraftWithGraspy={ways.draft}
        onBringYourOwn={ways.bringYourOwn}
      />
    );
  }

  if (writing.kind === "blank") {
    const entry = writing.forEntry;
    return (
      <NewAuthoredLesson
        academicContext={academicContext}
        pending={saving}
        error={error}
        initialTopic={entry?.subtopic ?? entry?.topic}
        onCancel={onCancel}
        onSave={(topic, content) =>
          // Written for a scheme entry, the plan belongs to that lesson rather
          // than becoming a second one beside it.
          onSave.authored({
            lessonId: null,
            schemeWeekId: entry?.schemeWeekId ?? null,
            schemeEntryId: entry?.schemeEntryId ?? null,
            topic,
            subtopic: entry?.subtopic ?? null,
            content,
          })
        }
      />
    );
  }

  if (writing.kind === "authored") {
    const { lesson, content } = writing;
    return (
      <AuthoredLessonReview
        academicContext={academicContext}
        lesson={lesson}
        content={content}
        saving={saving}
        error={error}
        onBack={onCancel}
        onSave={(topic, saved) =>
          onSave.authored({
            lessonId: lesson.id,
            schemeWeekId: lesson.schemeWeekId,
            schemeEntryId: lesson.schemeEntryId,
            topic,
            subtopic: lesson.subtopic,
            content: saved,
          })
        }
      />
    );
  }

  const { editor } = writing;
  return (
    <LessonEditor
      key={editor.kind === "edit" ? editor.lesson.id : attachedPlan?.entryId ?? "new"}
      academicContext={academicContext}
      bringingIn={attaching.bringingIn}
      lesson={editor.kind === "edit" ? editor.lesson : null}
      initialTopic={editor.kind === "new" ? editor.topic : undefined}
      initialPastedPlan={editor.kind === "new" ? editor.pastedPlan : undefined}
      initialInputMode={editor.kind === "new" ? editor.mode : undefined}
      schemeEntry={attachedPlan}
      availableSchemeEntries={attaching.schemeEntries}
      pending={saving}
      error={error}
      onCancel={onCancel}
      onSave={onSave.draft}
    />
  );
}
