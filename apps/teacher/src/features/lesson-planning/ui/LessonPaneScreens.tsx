import type { GranularLessonRecord } from "../domain/granularLesson";
import { draftFromLesson, draftFromSchemeEntry } from "../domain/lessonDrafting";
import { launchFor } from "../domain/lessonLaunching";
import type { LessonPaneWork } from "./model/lessonPaneWork";
import type { LessonDraft, WorkspaceLesson } from "../domain/lessonPlanning";
import type { LessonPreparationState } from "../domain/lessonPreparation";
import { GranularLessonReview } from "./GranularLessonReview";
import { LessonPaneWorkView } from "./LessonPaneWorkView";
import { LessonPreparationScreen } from "./LessonPreparationScreen";
import { LessonScreen } from "./LessonScreen";
import { useLessonsWorkspace } from "./useLessonsWorkspace";
import { StartLessonPanel } from "./StartLessonPanel";
import { UnplannedLesson } from "./UnplannedLesson";

/**
 * The pane's one selection point: exactly which screen shows, exhaustively.
 *
 * The view carries each branch's data, so a screen receives what winning the
 * decision already proved — the review its record, the run its state — and has
 * nothing left to re-check. A new kind of view fails compilation here until it
 * is given a screen.
 */
export function LessonPaneScreen() {
  const { paneView } = useLessonsWorkspace();
  switch (paneView.kind) {
    case "work":
      return <OpenWorkScreen work={paneView.work} />;
    case "planningEntry":
      return <PlanningEntryScreen entry={paneView.entry} />;
    case "lessonNeedsPlan":
      return <LessonNeedsPlanScreen lesson={paneView.lesson} />;
    case "preparing":
      return <PreparingScreen lesson={paneView.lesson} run={paneView.run} />;
    case "review":
      return <ReviewScreen lesson={paneView.lesson} record={paneView.record} />;
    case "lesson":
      return <LessonScreen lesson={paneView.lesson} />;
    case "nothingChosen":
      return <StartHereScreen />;
    default:
      return assertNever(paneView);
  }
}

function assertNever(value: never): never {
  throw new Error(`The pane has no screen for ${JSON.stringify(value)}.`);
}

/** Classwork, group classwork or class results, open in place of the lesson. */
function OpenWorkScreen({ work }: { readonly work: LessonPaneWork }) {
  const { context, differentiatedClassworkGateway, evidenceGateway, exportGateway, classworkGateway, screen } =
    useLessonsWorkspace();
  return (
    <LessonPaneWorkView
      work={work}
      context={context}
      classworkGateway={classworkGateway}
      differentiatedClassworkGateway={differentiatedClassworkGateway}
      evidenceGateway={evidenceGateway}
      exportGateway={exportGateway}
      onOpen={screen.goToWork}
    />
  );
}

/** A teaching week's entry with no lesson yet: the ways to start one from the week's topic. */
function PlanningEntryScreen({ entry }: { readonly entry: WorkspaceLesson }) {
  const { authoring, planningEntry, screen, snapshot } = useLessonsWorkspace();
  // The pane renders only inside a ready workspace, where authoring exists;
  // the guard carries that fact for the type, it is not a second decision.
  if (!authoring) return null;
  return (
    <UnplannedLesson
      topic={entry.topic}
      subtopic={entry.subtopic}
      weekOrdinal={entry.weekOrdinal}
      covers={
        entry.schemeEntryId === null && entry.schemeWeekId !== null
          ? snapshot?.availableSchemeEntries
              .filter((option) => option.weekId === entry.schemeWeekId)
              .map((option) => option.subtopic ?? option.topic)
          : undefined
      }
      onStartBlank={screen.writeByHand}
      onDraftWithGraspy={() =>
        planningEntry?.learningGoals.length
          ? void authoring.draftWithGraspy(draftFromSchemeEntry(entry, planningEntry))
          : screen.writeNew(launchFor(entry))
      }
      onBringYourOwn={() => screen.writeNew(launchFor(entry), "pasted")}
      onTakeOneSubtopic={(subtopic) => {
        // The same week, narrowed to the one entry the teacher named, so the
        // plan they write is bound to that subtopic rather than the week.
        const chosen = snapshot?.availableSchemeEntries.find(
          (option) =>
            option.weekId === entry.schemeWeekId && (option.subtopic ?? option.topic) === subtopic,
        );
        if (chosen) {
          screen.planEntry({
            ...entry,
            key: chosen.entryId,
            schemeWeekId: null,
            schemeEntryId: chosen.entryId,
            topic: chosen.topic,
            subtopic: chosen.subtopic,
          });
        }
      }}
    />
  );
}

/** A chosen lesson with no plan: the ways to start one from the teacher's own goals. */
function LessonNeedsPlanScreen({ lesson }: { readonly lesson: LessonDraft }) {
  const { authoring, controller, pendingAction, screen, selectedWeekOrdinal } =
    useLessonsWorkspace();
  if (!authoring) return null;
  return (
    <UnplannedLesson
      topic={lesson.topic}
      subtopic={lesson.subtopic}
      weekOrdinal={selectedWeekOrdinal}
      onStartBlank={() => screen.editLesson(lesson)}
      onDraftWithGraspy={() =>
        lesson.learningGoals.length
          ? void authoring.draftWithGraspy(draftFromLesson(lesson))
          : screen.editLesson(lesson)
      }
      onBringYourOwn={() => screen.editLesson(lesson)}
      discarding={{
        pending: pendingAction === "discard-lesson",
        onDiscard: () => void controller.discardLesson({ lessonId: lesson.id }),
      }}
    />
  );
}

/** A plan being written, with the run to watch and stop. */
function PreparingScreen({
  lesson,
  run,
}: {
  readonly lesson: LessonDraft;
  readonly run: LessonPreparationState;
}) {
  const { preparationController, selectedWeekOrdinal } = useLessonsWorkspace();
  return (
    <LessonPreparationScreen
      topic={lesson.subtopic ?? lesson.topic}
      weekOrdinal={selectedWeekOrdinal}
      state={run}
      onStop={() => preparationController.cancel(lesson.id)}
      onPrepareAgain={() => {
        preparationController.reset(lesson.id);
        void preparationController.prepare(lesson.id);
      }}
    />
  );
}

/** A prepared plan to read, edit and confirm. */
function ReviewScreen({
  lesson,
  record,
}: {
  readonly lesson: LessonDraft;
  readonly record: GranularLessonRecord;
}) {
  const { actionError, controller, pendingAction, preparationController, preparationUnderWay, screen, selectedWeekOrdinal } =
    useLessonsWorkspace();
  return (
    <GranularLessonReview
      lesson={lesson}
      weekOrdinal={selectedWeekOrdinal}
      record={record}
      originalPlan={lesson.sourcePlanText ?? lesson.rawPlan}
      pendingAction={pendingAction}
      beingPreparedAgain={preparationUnderWay !== null}
      error={actionError}
      onSave={(lessonId, saved) => controller.saveGranularLesson({ lessonId, record: saved })}
      onConfirm={async (lessonId) => {
        const settled = await controller.confirmGranularLesson({ lessonId });
        if (settled) {
          screen.confirm({
            lessonId,
            topic: lesson.subtopic ?? lesson.topic,
          });
          // Confirming answers with the week rather than the lesson, which
          // left the teacher looking at nothing they had just approved.
          // Reading it back is what lets the confirmation sit above the
          // lesson it is about.
          await controller.load(lessonId);
        }
        return settled;
      }}
      onRedraft={(lessonId) => void preparationController.prepare(lessonId)}
    />
  );
}

/** Nothing chosen: the ways to begin. */
function StartHereScreen() {
  const { screen } = useLessonsWorkspace();
  return (
    <StartLessonPanel
      onStartBlank={screen.writeByHand}
      onDraftWithGraspy={() => screen.writeNew(null)}
      onBringYourOwn={() => screen.writeNew(null, "pasted")}
    />
  );
}
