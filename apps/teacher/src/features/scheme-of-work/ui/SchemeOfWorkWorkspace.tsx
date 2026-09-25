import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import type { SchemeOfWorkGateway } from "../application/SchemeOfWorkGateway";
import type { SchemeContextRequest } from "../domain/schemeOfWork";
import {
  SchemeFailed,
  SchemeLoading,
  SchemePlannerScreen,
  SchemeStartScreen,
  SchemeValues,
} from "./SchemeScreens";
import { useSchemeOfWork } from "./useSchemeOfWork";

interface SchemeOfWorkWorkspaceProps {
  readonly gateway: SchemeOfWorkGateway;
  readonly academicContext: ActiveAcademicContext;
  readonly onCreateLesson?: (schemeWeekId: string, schemeEntryId: string) => void;
  readonly onOpenLesson?: (lessonId: string) => void;
}

/**
 * Wires the scheme of work together. What shows is not decided here — the
 * values are stated once and every screen answers for itself against them.
 */
export function SchemeOfWorkWorkspace({
  gateway,
  academicContext,
  onCreateLesson,
  onOpenLesson,
}: SchemeOfWorkWorkspaceProps) {
  const context: SchemeContextRequest = {
    academicSessionId: academicContext.workspace.activeSessionId,
    academicPeriodId: academicContext.period.id,
    teachingAssignmentId: academicContext.assignment.id,
  };
  const controller = useSchemeOfWork(gateway, context);

  return (
    <SchemeValues value={{ academicContext, controller, onCreateLesson, onOpenLesson }}>
      <SchemeLoading />
      <SchemeFailed />
      <SchemeStartScreen />
      <SchemePlannerScreen />
    </SchemeValues>
  );
}
