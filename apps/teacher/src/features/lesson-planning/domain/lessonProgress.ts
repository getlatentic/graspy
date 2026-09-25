export type LessonStageState = "done" | "now" | "next";

export interface LessonStage {
  readonly name: string;
  readonly state: LessonStageState;
}

interface LessonProgressInput {
  readonly status: "draft" | "confirmed";
  readonly hasPlan: boolean;
  /** Whether every part of this lesson's classwork is written. */
  readonly classworkWritten: boolean;
}

/**
 * Where a lesson has got to, in the three steps a teacher takes it through.
 *
 * Each step is a jump to another screen, and nothing said how they joined up —
 * writing a plan, confirming it, and creating the classwork read as unrelated
 * errands rather than one job with a middle.
 *
 * All three steps report done. "Create the classwork" once could not: the
 * lesson carried nothing about whether its classwork was written, so a finished
 * lesson looked exactly like one that had never started. It carries it now, and
 * the step says so.
 */
export function lessonStages({
  status,
  hasPlan,
  classworkWritten,
}: LessonProgressInput): LessonStage[] {
  // Confirming is only reachable from a plan, so a confirmed lesson has written
  // one whatever its steps say. Reading hasPlan alone put a teacher in two
  // places at once.
  const confirmed = status === "confirmed";
  const planWritten = confirmed || hasPlan;
  return [
    { name: "Write the plan", state: planWritten ? "done" : "now" },
    {
      name: "Confirm the plan",
      state: confirmed ? "done" : planWritten ? "now" : "next",
    },
    {
      name: "Create the classwork",
      state: classworkWritten ? "done" : confirmed ? "now" : "next",
    },
  ];
}
