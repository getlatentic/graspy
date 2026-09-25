import { useMemo } from "react";

export interface AcademicContextIds {
  readonly academicSessionId: string;
  readonly academicPeriodId: string;
  readonly teachingAssignmentId: string;
}

/**
 * The academic context as a value that changes only when one of its ids does.
 * Screens rebuild the context object on every render, and a hook that re-reads
 * its workspace whenever that object changes would re-read on every render.
 */
export function useStableAcademicContext(context: AcademicContextIds): AcademicContextIds {
  const { academicSessionId, academicPeriodId, teachingAssignmentId } = context;
  return useMemo(
    () => ({ academicSessionId, academicPeriodId, teachingAssignmentId }),
    [academicSessionId, academicPeriodId, teachingAssignmentId],
  );
}
