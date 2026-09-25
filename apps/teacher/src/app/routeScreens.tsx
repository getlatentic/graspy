import { InlineNotification } from "@carbon/react";
import { Outlet, useNavigate, useSearchParams } from "react-router";

import { AcademicWorkspaceShell } from "../features/academic-workspace/ui/AcademicWorkspaceShell";
import { useWorkspaceOutlet } from "../features/academic-workspace/ui/useWorkspaceOutlet";
import { AcademicWorkspaceManager } from "../features/academic-workspace/ui/AcademicWorkspaceManager";
import { ClassesDashboard } from "../features/academic-workspace/ui/ClassesDashboard";
import { Home } from "../features/academic-workspace/ui/Home";
import { assignmentsForSession } from "../features/academic-workspace/domain/academicWorkspace";
import { ClassTimetableWorkspace } from "../features/class-timetable/ui/ClassTimetableWorkspace";
import { NextClassPanel } from "../features/class-timetable/ui/NextClassPanel";
import { useNextClass, useTodaysClasses } from "../features/class-timetable/ui/useClassTimetable";
import { classListing } from "../features/class-timetable/domain/classTimetable";
import { PlanMyTerm } from "../features/academic-workspace/ui/PlanMyTerm";
import { PhotographReadingSetup } from "../features/model-acquisition/ui/PhotographReadingSetup";
import { LessonsWorkspace } from "../features/lesson-planning/ui/LessonsWorkspace";
import { SchemeOfWorkWorkspace } from "../features/scheme-of-work/ui/SchemeOfWorkWorkspace";
import { ModelSetupBoundary } from "../features/model-acquisition/ui/ModelSetupBoundary";
import {
  CurriculumLibrary,
  CurriculumRequired,
} from "../features/curriculum-catalog/ui/CurriculumLibrary";
import { LaunchBoundary } from "../features/launch-health/ui/LaunchBoundary";
import { lessonRoute } from "../features/lesson-planning/ui/model/lessonOpening";
import {
  academicWorkspaceGateway,
  schemeOfWorkGateway,
  lessonPlanningGateway,
  lessonPreparationGenerator,
  preparationProgressGateway,
  lessonDocumentImporter,
  lessonPhotographReader,
  photographReadingGateway,
  classworkGateway,
  lessonNoteGenerator,
  lessonEvidenceGateway,
  differentiatedClassworkGateway,
  modelAcquisitionGateway,
  lessonModelGateway,
  classworkExportGateway,
  lessonPlanExportGateway,
  curriculumCatalogGateway,
  launchHealthGateway,
  classTimetableGateway,
} from "./gateways";

/** Health and model setup gate the whole app before any route renders. */
export function AppBoundaries() {
  return (
    <LaunchBoundary gateway={launchHealthGateway}>
      <ModelSetupBoundary
        gateway={modelAcquisitionGateway}
        lessonModelGateway={lessonModelGateway}
      >
        <Outlet />
      </ModelSetupBoundary>
    </LaunchBoundary>
  );
}

export function WorkspaceLayout() {
  return (
    <AcademicWorkspaceShell
      gateway={academicWorkspaceGateway}
      curriculumGateway={curriculumCatalogGateway}
      schemeGateway={schemeOfWorkGateway}
    />
  );
}

/** Make a class the active workspace and drop into a fresh lessons view. */
/**
 * Open a class, on whichever of its screens the teacher is being sent to.
 *
 * A class with no term planned is sent to the term rather than to its lessons:
 * the plan is the first step, and it used to live inside the second screen.
 */
function useOpenWorkspace(at = "/lessons") {
  const { academicContext, controller, setLaunch, bumpReset } = useWorkspaceOutlet();
  const navigate = useNavigate();
  const workspace = academicContext.workspace;
  return (assignmentId: string) => {
    setLaunch(null);
    bumpReset();
    void controller.setActiveContext({
      academicSessionId: workspace.activeSessionId,
      academicPeriodId: workspace.activePeriodId,
      assignmentId,
    });
    navigate(at);
  };
}

/**
 * The two ways a term plan reaches a lesson: start the one a weekly plan still
 * needs, or open the one it already has. A weekly plan carries a single lesson,
 * so a screen is only ever offering one of them.
 */
function useLessonFromWeeklyPlan() {
  const { setLaunch } = useWorkspaceOutlet();
  const navigate = useNavigate();
  const start = (schemeWeekId: string, schemeEntryId: string) => {
    setLaunch({ schemeWeekId, schemeEntryId });
    navigate("/lessons");
  };
  const open = (lessonId: string) => {
    setLaunch(null);
    navigate(lessonRoute(lessonId));
  };
  return { start, open };
}

/**
 * Home leads with the next period rather than with a greeting: what a teacher
 * opens the app on a Sunday evening to find out is what happens on Monday.
 */
export function HomeRoute() {
  const { academicContext } = useWorkspaceOutlet();
  const openWorkspace = useOpenWorkspace();
  const planTerm = useOpenWorkspace("/plan");
  const navigate = useNavigate();
  const term = {
    academicSessionId: academicContext.workspace.activeSessionId,
    academicPeriodId: academicContext.workspace.activePeriodId,
  };
  const next = useNextClass(classTimetableGateway, term);
  const todaysClasses = useTodaysClasses(classTimetableGateway, term);
  return (
    <Home
      workspace={academicContext.workspace}
      onOpenWorkspace={openWorkspace}
      onPlanTerm={planTerm}
      onAddClass={() => navigate("/classes/manage")}
      listing={classListing(todaysClasses, next !== null)}
      todaysClasses={todaysClasses}
    >
      <NextClassPanel
        next={next}
        onSetTimetable={() => navigate("/timetable")}
        onOpenClass={openWorkspace}
      />
    </Home>
  );
}

export function TimetableRoute() {
  const { academicContext } = useWorkspaceOutlet();
  const navigate = useNavigate();
  const { workspace } = academicContext;
  return (
    <ClassTimetableWorkspace
      gateway={classTimetableGateway}
      context={{
        academicSessionId: workspace.activeSessionId,
        academicPeriodId: workspace.activePeriodId,
      }}
      classes={assignmentsForSession(workspace, workspace.activeSessionId).filter(
        (assignment) => assignment.status === "active",
      )}
      termName={academicContext.period.name}
      onDone={() => navigate("/")}
    />
  );
}

export function ClassesRoute() {
  const { academicContext } = useWorkspaceOutlet();
  const openWorkspace = useOpenWorkspace();
  const planTerm = useOpenWorkspace("/plan");
  const navigate = useNavigate();
  const manageClasses = () => navigate("/classes/manage");
  return (
    <ClassesDashboard
      workspace={academicContext.workspace}
      onOpenWorkspace={openWorkspace}
      onPlanTerm={planTerm}
      onManage={manageClasses}
    />
  );
}

export function LessonsRoute() {
  const { academicContext, launch, resetToken, actionError } = useWorkspaceOutlet();
  const [search] = useSearchParams();
  const requestedLessonId = search.get("lesson");
  const requestedOpening = search.get("open");
  const workspace = academicContext.workspace;
  return (
    <main className="min-h-0 w-full min-w-0 flex-1">
      {actionError ? (
        <InlineNotification
          className="mx-auto w-[min(100%-2rem,62rem)]"
          kind="error"
          lowContrast
          hideCloseButton
          title="Teaching context not changed"
          subtitle={actionError}
        />
      ) : null}
      <LessonsWorkspace
        key={`${workspace.activeSessionId}:${academicContext.period.id}:${academicContext.assignment.id}:${launch?.schemeEntryId ?? "browse"}:${resetToken}`}
        academicContext={academicContext}
        gateway={lessonPlanningGateway}
        preparationGenerator={lessonPreparationGenerator}
        preparationProgressGateway={preparationProgressGateway}
        classworkGateway={classworkGateway}
        noteGenerator={lessonNoteGenerator}
        evidenceGateway={lessonEvidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
        exportGateway={classworkExportGateway}
        planExportGateway={lessonPlanExportGateway}
        classTimetableGateway={classTimetableGateway}
        bringingIn={{
          documentImporter: lessonDocumentImporter,
          photographReader: lessonPhotographReader,
          photographReadingSetup: (onReady) => (
            <PhotographReadingSetup gateway={photographReadingGateway} onReady={onReady} />
          ),
        }}
        arrivedFrom={{ launch, lessonId: requestedLessonId, openAt: requestedOpening }}
      />
    </main>
  );
}

export function PlanRoute() {
  const { academicContext, controller, curriculumController, schemeGateway, pendingAction, actionError } =
    useWorkspaceOutlet();
  const lessonFromWeeklyPlan = useLessonFromWeeklyPlan();
  const workspace = academicContext.workspace;
  const assignment = academicContext.assignment;
  const curriculum = curriculumController.state;
  if (curriculum.status !== "ready") return null;

  return (
    <PlanMyTerm>
      {!assignment.curriculumCourseId ? (
        // A weekly plan is built from a curriculum, so this is the one place the
        // attachment is genuinely required.
        <CurriculumRequired
          assignment={assignment}
          catalog={curriculum.catalog}
          installing={curriculum.installing}
          error={curriculum.error ?? actionError}
          assigning={pendingAction === `curriculum-${assignment.id}`}
          onInstall={curriculumController.installPackage}
          onAssign={(curriculumCourseId) =>
            controller.assignCurriculumCourse({
              assignmentId: assignment.id,
              curriculumCourseId,
            })
          }
        />
      ) : (
        <SchemeOfWorkWorkspace
          key={`${workspace.activeSessionId}:${workspace.activePeriodId}:${assignment.id}`}
          gateway={schemeGateway}
          academicContext={academicContext}
          onCreateLesson={lessonFromWeeklyPlan.start}
          onOpenLesson={lessonFromWeeklyPlan.open}
        />
      )}
    </PlanMyTerm>
  );
}

export function ClassesManageRoute() {
  const { academicContext, snapshot, controller, curriculumController, pendingAction, actionError } =
    useWorkspaceOutlet();
  const curriculum = curriculumController.state;
  if (curriculum.status !== "ready") return null;
  return (
    <AcademicWorkspaceManager
      snapshot={snapshot}
      workspace={academicContext.workspace}
      pendingAction={pendingAction}
      error={actionError}
      onAdd={controller.addAssignment}
      onUpdate={controller.updateAssignment}
      onArchive={controller.archiveAssignment}
      onCreateSession={controller.createSession}
      catalog={curriculum.catalog}
      curriculumLibrary={
        <CurriculumLibrary
          catalog={curriculum.catalog}
          installing={curriculum.installing}
          error={curriculum.error}
          onInstall={curriculumController.installPackage}
        />
      }
      onAssignCurriculum={controller.assignCurriculumCourse}
    />
  );
}
