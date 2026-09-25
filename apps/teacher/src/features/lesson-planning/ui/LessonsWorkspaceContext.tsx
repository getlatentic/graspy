import type { ReactNode } from "react";

import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import type { BackgroundTask } from "../../background-tasks/domain/backgroundTask";
import { workUnderWay } from "../../background-tasks/domain/backgroundTask";
import type { DifferentiatedClassworkGateway } from "../../differentiated-classwork/application/DifferentiatedClassworkGateway";
import type { ClassworkExportGateway } from "../../document-export/application/ClassworkExportGateway";
import type { TeachingSlot } from "../../class-timetable/domain/classTimetable";
import type { LessonPlanExportGateway } from "../../document-export/application/LessonPlanExportGateway";
import type { useLessonPlanExport } from "../../document-export/ui/useLessonPlanExport";
import type { LessonEvidenceGateway } from "../../learner-evidence/application/LessonEvidenceGateway";
import type { ClassworkGateway } from "../../classwork/application/ClassworkGateway";
import type { WaysToBringInAPlan } from "./useBringingInAPlan";
import type { LessonOpening } from "./model/lessonOpening";
import { lessonPaneView, type LessonPaneView } from "./model/lessonPaneView";
import type {
  CurrentTeachingWeek,
  LessonContextRequest,
  SaveAuthoredLessonRequest,
  SaveLessonDraftRequest,
} from "../domain/lessonPlanning";
import { schemeGroundToPlan, type LessonToDraft } from "../domain/lessonDrafting";
import { authoredContentOf } from "../domain/lessonReadiness";
import { lessonWritingFor } from "./model/lessonWriting";
import {
  lessonsWorkspaceView,
  type LessonsWorkspaceView,
} from "./model/lessonsWorkspaceView";
import { lessonAuthoring } from "../application/lessonAuthoring";
import { LessonsWorkspaceValueContext } from "./useLessonsWorkspace";

import type { useLessonNoteGeneration } from "./useLessonNoteGeneration";
import type { useLessonPlanning } from "./useLessonPlanning";
import type { usePreparationBesideTheScreen } from "./useLessonPreparation";
import type { useLessonsScreen } from "./useLessonsScreen";

/**
 * What the workspace hands over: its wiring and its controllers, before
 * anything is derived from them.
 */
export interface LessonsWorkspaceIngredients {
  readonly academicContext: ActiveAcademicContext;
  readonly context: LessonContextRequest;
  readonly controller: ReturnType<typeof useLessonPlanning>;
  readonly screen: ReturnType<typeof useLessonsScreen>;
  readonly tasks: readonly BackgroundTask[];
  readonly noteController: ReturnType<typeof useLessonNoteGeneration>;
  readonly planExport: ReturnType<typeof useLessonPlanExport>;
  readonly preparationController: ReturnType<typeof usePreparationBesideTheScreen>;
  readonly opening: LessonOpening | null;
  readonly currentWeek: CurrentTeachingWeek | null;
  readonly classworkGateway: ClassworkGateway;
  readonly evidenceGateway: LessonEvidenceGateway;
  readonly differentiatedClassworkGateway: DifferentiatedClassworkGateway;
  readonly exportGateway?: ClassworkExportGateway;
  readonly planExportGateway?: LessonPlanExportGateway;
  /** The periods this class is taught in, for the plan a school reads. */
  readonly timetable: readonly TeachingSlot[];
  /** What a plan can be brought in with, passed on whole by every screen. */
  readonly bringingIn: WaysToBringInAPlan;
}

/** The ingredients plus everything settled from them, stated once. */
export interface LessonsWorkspaceValue extends LessonsWorkspaceIngredients {
  readonly snapshot: ReadySnapshot | null;
  readonly selectedLesson: LessonDraftOrNull;
  readonly pendingAction: string | null;
  readonly actionError: string | null;
  readonly planning: ReturnType<typeof useLessonsScreen>["planning"];
  readonly confirmed: ReturnType<typeof useLessonsScreen>["confirmed"];
  readonly planningEntry: SchemeEntryOrUndefined;
  readonly selectedWeekOrdinal: number | null;
  readonly preparationUnderWay: ReturnType<typeof workUnderWay> | null;
  readonly writingScreen: ReturnType<typeof lessonWritingFor>;
  readonly authoring: ReturnType<typeof authoringActions> | null;
  readonly paneView: LessonPaneView;
  readonly shownWorkspace: LessonsWorkspaceView;
}

type ReadySnapshot = Extract<
  ReturnType<typeof useLessonPlanning>["state"],
  { status: "ready" }
>["snapshot"];
type LessonDraftOrNull = ReadySnapshot["selectedLesson"];
type SchemeEntryOrUndefined = ReadySnapshot["availableSchemeEntries"][number] | undefined;

/**
 * Settles everything the workspace's screens read, from the ingredients alone.
 *
 * Both decisions are made here — which workspace screen is on, and which pane
 * screen within the week — so no caller can hand a screen a state that
 * disagrees with the lesson it is showing. The screens read; they do not
 * compute the world they are in.
 */
export function LessonsWorkspaceProvider({
  value,
  children,
}: {
  readonly value: LessonsWorkspaceIngredients;
  readonly children: ReactNode;
}) {
  const { controller, screen, tasks, preparationController } = value;
  const state = controller.state;
  const snapshot = state.status === "ready" ? state.snapshot : null;
  const selectedLesson = snapshot?.selectedLesson ?? null;
  // The pane's screens come and go; the watcher must not, or a lesson finishing
  // while the teacher reads another would drag them off it.
  preparationController.watch(selectedLesson?.id ?? null);

  const preparationState = selectedLesson
    ? preparationController.stateFor(selectedLesson.id)
    : null;
  const writingScreen = lessonWritingFor(
    screen,
    selectedLesson,
    authoredContentOf(selectedLesson),
  );
  const settled: LessonsWorkspaceValue = {
    ...value,
    snapshot,
    selectedLesson,
    pendingAction: state.status === "ready" ? state.pendingAction : null,
    actionError: state.status === "ready" ? state.actionError : null,
    planning: screen.planning,
    confirmed: screen.confirmed,
    planningEntry:
      screen.planning && snapshot
        ? schemeGroundToPlan(screen.planning, snapshot.availableSchemeEntries)
        : undefined,
    selectedWeekOrdinal:
      snapshot?.availableSchemeEntries.find(
        (entry) => entry.entryId === selectedLesson?.schemeEntryId,
      )?.weekOrdinal ?? null,
    // What this lesson already has in hand, so no control offers to start it twice.
    preparationUnderWay: selectedLesson
      ? workUnderWay(tasks, selectedLesson.id, "lesson_preparation")
      : null,
    writingScreen,
    authoring: snapshot
      ? authoringActions(
          lessonAuthoring({
            snapshot,
            saveDraft: controller.saveDraft,
            saveAuthoredLesson: controller.saveAuthoredLesson,
          }),
          {
            load: controller.load,
            prepare: (lessonId) => void preparationController.prepare(lessonId),
            openLesson: screen.openLesson,
            closeEditor: screen.stopWriting,
            finishWritingByHand: screen.finishWritingByHand,
          },
        )
      : null,
    paneView: lessonPaneView({
      openWork: screen.paneWork,
      planningEntry: screen.planning,
      lesson: selectedLesson,
      preparation: preparationState,
    }),
    shownWorkspace: lessonsWorkspaceView(state.status, writingScreen !== null),
  };
  return <LessonsWorkspaceValueContext value={settled}>{children}</LessonsWorkspaceValueContext>;
}

/**
 * What the screen does about a save, which is the only part that knows there
 * is a screen.
 *
 * The flow reports what a save came to; this turns each outcome into where the
 * teacher should be looking. The order matters and is the reason it lives
 * here: the screen is pointed at the lesson before it is read back, so the
 * entry being planned is not still on screen while the read is in flight.
 */
function authoringActions(
  flows: ReturnType<typeof lessonAuthoring>,
  screenActions: {
    readonly load: (lessonId?: string) => Promise<boolean>;
    readonly prepare: (lessonId: string) => void;
    readonly openLesson: () => void;
    readonly closeEditor: () => void;
    readonly finishWritingByHand: () => void;
  },
) {
  return {
    draftWithGraspy: async (target: LessonToDraft) => {
      const outcome = await flows.draftWithGraspy(target);
      if (outcome.kind !== "saved" || !outcome.lessonId) return;
      screenActions.openLesson();
      await screenActions.load(outcome.lessonId);
      screenActions.prepare(outcome.lessonId);
    },

    saveAuthored: async (request: Omit<SaveAuthoredLessonRequest, "context">) => {
      const outcome = await flows.saveAuthored(request);
      if (outcome.kind !== "saved") return false;
      // A lesson written from nothing lands in place of the entry it was
      // written for; an edit leaves the teacher where they already were.
      if (outcome.isNew) screenActions.finishWritingByHand();
      return true;
    },

    saveDraftedPlan: async (
      request: Omit<SaveLessonDraftRequest, "context">,
      andPrepare: boolean,
    ) => {
      const outcome = await flows.savePlan(request);
      if (outcome.kind !== "saved") return false;
      screenActions.closeEditor();
      if (andPrepare && outcome.lessonId) {
        await screenActions.load(outcome.lessonId);
        screenActions.prepare(outcome.lessonId);
      }
      return true;
    },
  };
}
