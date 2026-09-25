import { workUnderWay } from "../../background-tasks/domain/backgroundTask";
import { planExportInput, planFileName } from "../domain/lessonApproval";
import { noteJob } from "../domain/lessonNoteJob";
import { notePanelFor } from "./model/lessonNotePanel";
import type { LessonDraft } from "../domain/lessonPlanning";
import { LessonArtifactTabs, type PlanExportOutcome } from "./LessonArtifactTabs";
import { LessonConfirmed } from "./LessonConfirmed";
import { LessonDetail, LessonNextSteps, LessonPlanPanel } from "./LessonDetail";
import { useLessonsWorkspace } from "./useLessonsWorkspace";

/**
 * The lesson itself — what it says, and where it leads next.
 *
 * Its three parts come in a fixed order a teacher reads in turn: the banner if
 * the lesson was just confirmed, the lesson's own documents, and the steps
 * after it. Fixed order is why they are composed here rather than by the
 * caller — there is no arrangement to choose.
 *
 * The lesson arrives as a prop from the pane's dispatcher: winning the
 * decision is what proved it exists.
 */
export function LessonScreen({ lesson }: { readonly lesson: LessonDraft }) {
  return (
    <>
      <JustConfirmed lesson={lesson} />
      <LessonDetailWithNextSteps lesson={lesson} />
    </>
  );
}

/**
 * The one-time note that a lesson has just been confirmed, and what that opens
 * up. Shown for the lesson it was confirmed for, not whichever is on screen.
 */
function JustConfirmed({ lesson }: { readonly lesson: LessonDraft }) {
  const { confirmed, screen } = useLessonsWorkspace();
  if (confirmed?.lessonId !== lesson.id) return null;
  return (
    <LessonConfirmed
      onCreateClasswork={() => {
        screen.openWork("classwork", lesson.id);
        screen.dismissConfirmation();
      }}
    />
  );
}

function LessonDetailWithNextSteps({ lesson }: { readonly lesson: LessonDraft }) {
  const { selectedWeekOrdinal, screen, controller } = useLessonsWorkspace();
  const openClasswork = () => screen.openWork("classwork", lesson.id);
  // Whether this lesson's classwork is written lives on its summary beside the
  // week, not on the lesson itself — one rule, read where it is kept.
  const summary =
    controller.state.status === "ready"
      ? controller.state.snapshot.lessons.find(({ id }) => id === lesson.id)
      : undefined;
  return (
    <LessonDetail
      lesson={lesson}
      weekOrdinal={selectedWeekOrdinal}
      classworkWritten={summary?.classworkComplete ?? false}
      onOpenClasswork={openClasswork}
    >
      <Artifacts lesson={lesson} />
      <NextSteps lesson={lesson} />
    </LessonDetail>
  );
}

/**
 * The lesson's documents: the plan, and the note pupils write.
 *
 * Exporting is offered only when there is a plan to export and somewhere to
 * export it to, so an empty lesson does not offer a blank document.
 */
function Artifacts({ lesson }: { readonly lesson: LessonDraft }) {
  const {
    selectedWeekOrdinal,
    academicContext,
    opening,
    planExport,
    planExportGateway,
    timetable,
    noteController,
    tasks,
  } = useLessonsWorkspace();
  const exportable = planExportGateway && lesson.steps.length > 0;
  return (
    <LessonArtifactTabs
      openAt={opening?.at === "artifact" ? opening.tab : null}
      exportOutcome={planExportOutcome(planExport.state)}
      onExport={
        exportable
          ? () =>
              void planExport.savePlan(
                planFileName(lesson),
                planExportInput(lesson, selectedWeekOrdinal, academicContext, timetable),
              )
          : null
      }
      note={{
        ...notePanelFor(
          lesson,
          noteController.stateFor(lesson.id),
          workUnderWay(tasks, lesson.id, "lesson_note") !== null,
        ),
        onGenerate: () => void noteController.generate(noteJob(lesson)),
      }}
      plan={<LessonPlanPanel lesson={lesson} />}
    />
  );
}

/**
 * What to say about the last export, in the teacher's terms.
 *
 * The state machine already knew; no screen read it, so a PDF was written to
 * the laptop and the teacher was told neither that it had been nor where.
 */
function planExportOutcome(
  state: ReturnType<typeof useLessonsWorkspace>["planExport"]["state"],
): PlanExportOutcome | null {
  if (state.status === "exporting") return { kind: "saving" };
  if (state.status === "saved" && state.artifact) {
    return { kind: "saved", path: state.artifact.path };
  }
  if (state.status === "failed") {
    return { kind: "failed", message: state.message ?? "Try again." };
  }
  return null;
}

/** Where the lesson leads: editing it, preparing it, or the work after it. */
function NextSteps({ lesson }: { readonly lesson: LessonDraft }) {
  const {
    academicContext,
    pendingAction,
    preparationUnderWay,
    preparationController,
    controller,
    screen,
  } = useLessonsWorkspace();
  return (
    <LessonNextSteps
      lesson={lesson}
      academicContext={academicContext}
      pendingAction={pendingAction}
      preparationUnderWay={preparationUnderWay}
      onEdit={() => screen.editLesson(lesson)}
      onPrepare={() => void preparationController.prepare(lesson.id)}
      onMove={controller.moveDraft}
      onDiscard={() => void controller.discardLesson({ lessonId: lesson.id })}
      onOpenClasswork={() => screen.openWork("classwork", lesson.id)}
      onOpenEvidence={() => screen.openWork("classResults", lesson.id)}
    />
  );
}
