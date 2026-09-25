import { appTaskStore } from "../../background-tasks/application/appTaskStore";
import type { BackgroundTaskStore } from "../../background-tasks/application/BackgroundTaskStore";
import { useWorkUnderWay } from "../../background-tasks/ui/useWorkUnderWay";
import type { ClassworkExportGateway } from "../../document-export/application/ClassworkExportGateway";
import type { LessonContextRequest } from "../../lesson-planning/domain/lessonPlanning";
import type { ClassworkGateway } from "../application/ClassworkGateway";
import { ClassworkValues } from "./ClassworkContext";
import { Classwork, ClassworkFailed, ClassworkLoading } from "./ClassworkScreens";
import { useClassworkGeneration } from "./useClassworkGeneration";

interface Props {
  readonly lessonId: string;
  readonly context: LessonContextRequest;
  readonly gateway: ClassworkGateway;
  readonly exportGateway?: ClassworkExportGateway;
  readonly onBack: () => void;
  readonly onOpenGroupClasswork?: () => void;
  /** The app's record of work under way, so this page never offers a second run. */
  readonly taskStore?: BackgroundTaskStore;
}

/**
 * Wires the lesson's classwork together: the run, the app's record of it, and
 * the screens they feed. What shows is not decided here — the values are
 * stated once and every screen answers for itself against them.
 */
export function ClassworkWorkspace({
  lessonId,
  context,
  gateway,
  exportGateway,
  onBack,
  onOpenGroupClasswork,
  taskStore = appTaskStore,
}: Props) {
  const controller = useClassworkGeneration(gateway, context, lessonId);
  const underWay = useWorkUnderWay(taskStore, context, lessonId, "classwork");

  return (
    <ClassworkValues
      value={{
        lessonId,
        context,
        gateway,
        exportGateway,
        controller,
        underWay,
        onBack,
        onOpenGroupClasswork,
      }}
    >
      <ClassworkLoading />
      <ClassworkFailed />
      <Classwork>
        <Classwork.Header />
        <Classwork.Progress />
        <Classwork.Notices />
        <Classwork.Sheet>
          <Classwork.Creation />
          <Classwork.Made>
            <Classwork.Goals />
            <Classwork.Document />
            <Classwork.NotMadeYet />
            <Classwork.FollowUps />
          </Classwork.Made>
        </Classwork.Sheet>
      </Classwork>
    </ClassworkValues>
  );
}
