import type { LearningSession } from "@/lib/curriculum-record";

export type SetupState = "complete" | "active" | "pending";

export type SetupHint =
  "subjectsReady" | "lessonReady" | "startLesson" | "lessonInProgress";

export interface SetupStep {
  key: "generate" | "path" | "session";
  state: SetupState;
  hint: SetupHint | null;
}

interface PlanSoFar {
  isGenerating: boolean;
  subjectCount: number;
  session: LearningSession | undefined;
  hasNextSubject: boolean;
}

const lessonState = (session: LearningSession): SetupState =>
  session.phase === "complete" ? "complete" : "active";

export function setupSteps(plan: PlanSoFar): SetupStep[] {
  const { isGenerating, subjectCount, session, hasNextSubject } = plan;
  return [
    {
      key: "generate",
      state: isGenerating
        ? "active"
        : subjectCount > 0
          ? "complete"
          : "pending",
      hint: subjectCount > 0 ? "subjectsReady" : null,
    },
    {
      key: "path",
      state: pathState(plan),
      hint:
        session?.phase === "explanation"
          ? "lessonReady"
          : hasNextSubject
            ? "startLesson"
            : null,
    },
    {
      key: "session",
      state: session ? lessonState(session) : "pending",
      hint: session && session.phase !== "complete" ? "lessonInProgress" : null,
    },
  ];
}

function pathState({
  subjectCount,
  session,
  hasNextSubject,
}: PlanSoFar): SetupState {
  if (subjectCount === 0) return "pending";
  if (session) return lessonState(session);
  return hasNextSubject ? "active" : "complete";
}
