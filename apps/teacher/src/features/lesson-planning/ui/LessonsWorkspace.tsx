import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import { appTaskStore } from "../../background-tasks/application/appTaskStore";
import type { BackgroundTaskStore } from "../../background-tasks/application/BackgroundTaskStore";
import { useBackgroundTasks } from "../../background-tasks/ui/useBackgroundTasks";
import type { DifferentiatedClassworkGateway } from "../../differentiated-classwork/application/DifferentiatedClassworkGateway";
import type { ClassworkExportGateway } from "../../document-export/application/ClassworkExportGateway";
import type { LessonPlanExportGateway } from "../../document-export/application/LessonPlanExportGateway";
import { useLessonPlanExport } from "../../document-export/ui/useLessonPlanExport";
import type { LessonEvidenceGateway } from "../../learner-evidence/application/LessonEvidenceGateway";
import type { ClassworkGateway } from "../../classwork/application/ClassworkGateway";
import type { LessonNoteGenerator } from "../application/LessonNoteGenerator";
import type { LessonPlanningGateway } from "../application/LessonPlanningGateway";
import {
  formatCurriculumTitle,
  type LessonLaunch,
  type LessonSummary,
} from "../domain/lessonPlanning";
import type { GranularLessonGenerator } from "../infrastructure/LocalGranularLessonGenerator";
import type { PreparationProgressGateway } from "../infrastructure/TauriPreparationProgressGateway";
import { LessonPane } from "./LessonPane";
import { LessonsView } from "./LessonsView";
import { Week } from "./WeekScreen";
import { useFirstLessonOpened, useLessonArrival } from "./useLessonArrival";
import { useLessonNoteGeneration } from "./useLessonNoteGeneration";
import { useLessonPlanning } from "./useLessonPlanning";
import { usePreparationBesideTheScreen } from "./useLessonPreparation";
import { useLessonsScreen } from "./useLessonsScreen";
import type { ClassTimetableGateway } from "../../class-timetable/application/ClassTimetableGateway";
import { useTaughtPeriods } from "../../class-timetable/ui/useClassTimetable";
import type { WaysToBringInAPlan } from "./useBringingInAPlan";

interface LessonsWorkspaceProps {
  readonly academicContext: ActiveAcademicContext;
  readonly gateway: LessonPlanningGateway;
  readonly preparationGenerator: GranularLessonGenerator;
  readonly preparationProgressGateway?: PreparationProgressGateway;
  readonly classworkGateway: ClassworkGateway;
  readonly noteGenerator: LessonNoteGenerator;
  readonly evidenceGateway: LessonEvidenceGateway;
  readonly differentiatedClassworkGateway: DifferentiatedClassworkGateway;
  readonly exportGateway?: ClassworkExportGateway;
  readonly planExportGateway?: LessonPlanExportGateway;
  readonly classTimetableGateway?: ClassTimetableGateway;
  /**
   * How the teacher got here, when they did not simply open the week.
   *
   * All three answer one question and are set together by whoever sent them —
   * a weekly plan they launched from, or the running-task bar returning them to
   * work with the place in it that the work was.
   */
  readonly arrivedFrom?: {
    readonly launch?: LessonLaunch | null;
    readonly lessonId?: string | null;
    readonly openAt?: string | null;
  };
  /**
   * The app's record of work under way. A teacher who set a lesson going ten
   * minutes ago on another screen cannot be expected to remember; this is how
   * the controls here know not to offer it a second time.
   */
  readonly taskStore?: BackgroundTaskStore;
  /** Where a plan can come from besides being typed: a file, or a photograph. */
  readonly bringingIn?: WaysToBringInAPlan;
}

/** A stable empty list, so an unread workspace does not look like a new one each render. */
const EMPTY_LESSONS: readonly LessonSummary[] = [];

/**
 * Wires the lessons feature together: the controllers, the arrival, and the
 * screens they feed. What shows is not decided here — the values are stated
 * once and every screen answers for itself against them.
 */
export function LessonsWorkspace({
  academicContext,
  gateway,
  preparationGenerator,
  preparationProgressGateway,
  classworkGateway,
  noteGenerator,
  evidenceGateway,
  differentiatedClassworkGateway,
  exportGateway,
  planExportGateway,
  classTimetableGateway,
  arrivedFrom,
  taskStore = appTaskStore,
  bringingIn = {},
}: LessonsWorkspaceProps) {
  const launch = arrivedFrom?.launch ?? null;
  const context = {
    academicSessionId: academicContext.workspace.activeSessionId,
    academicPeriodId: academicContext.period.id,
    teachingAssignmentId: academicContext.assignment.id,
  };
  const tasks = useBackgroundTasks(taskStore, context);
  const controller = useLessonPlanning(gateway, context);
  const noteController = useLessonNoteGeneration(gateway, noteGenerator, context);
  const planExport = useLessonPlanExport(planExportGateway ?? NO_PLAN_EXPORT);
  const timetable = useTaughtPeriods(classTimetableGateway ?? null, context);
  const screen = useLessonsScreen(launch);

  const opening = useLessonArrival({
    lessonId: arrivedFrom?.lessonId ?? null,
    openAt: arrivedFrom?.openAt ?? null,
    openLesson: screen.openLesson,
    openWork: screen.openWork,
    load: (lessonId) => void controller.load(lessonId),
  });
  const preparationController = usePreparationBesideTheScreen({
    generator: preparationGenerator,
    context,
    progressGateway: preparationProgressGateway,
    getProgramInput: (lessonId) =>
      controller.getGranularProgramInput({ lessonId, lessonDurationMinutes: 50 }),
    load: controller.load,
  });

  const scheduledWeek = academicContext.assignment.currentWeek ?? null;
  const currentWeek =
    scheduledWeek && scheduledWeek.title
      ? { ...scheduledWeek, title: formatCurriculumTitle(scheduledWeek.title) }
      : scheduledWeek;
  const readyState = controller.state.status === "ready" ? controller.state.snapshot : null;
  useFirstLessonOpened({
    ready: readyState !== null,
    assignmentId: academicContext.assignment.id,
    lessons: readyState?.lessons ?? EMPTY_LESSONS,
    busy: !!readyState?.selectedLesson || screen.writing !== null,
    currentWeekOrdinal: currentWeek?.ordinal ?? null,
    load: (lessonId) => void controller.load(lessonId),
  });

  return (
    <LessonsView
      values={{
        academicContext,
        context,
        controller,
        screen,
        tasks,
        noteController,
        planExport,
        timetable,
        preparationController,
        opening,
        currentWeek,
        classworkGateway,
        evidenceGateway,
        differentiatedClassworkGateway,
        exportGateway,
        planExportGateway,
        bringingIn,
      }}
    >
      <LessonsView.Loading />
      <LessonsView.Failed />
      <LessonsView.Writing />
      <Week>
        <Week.Header />
        <Week.Notices />
        <Week.Grid>
          <Week.Lessons />
          <LessonPane />
        </Week.Grid>
      </Week>
    </LessonsView>
  );
}

/** A stand-in when no plan-export gateway is wired, so the hook is unconditional. */
const NO_PLAN_EXPORT: LessonPlanExportGateway = {
  choosePdfDestination: () => Promise.resolve(null),
  savePdf: () => Promise.reject(new Error("Plan export is unavailable.")),
  print: () => Promise.resolve(),
};
