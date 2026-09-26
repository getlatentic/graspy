import { isUnreachable } from "@/lib/mcp/unreachable";

export interface LessonProblem {
  /** What to say under "The lesson didn't load"; null when that is all there is to say. */
  key: string | null;
  retryable: boolean;
}

export type LessonFailure = "unreachable" | "failed";

export const lessonFailure = (error: unknown): LessonFailure =>
  isUnreachable(error) ? "unreachable" : "failed";

interface LessonPageState {
  loaded: boolean;
  hasSubject: boolean;
  hasTarget: boolean;
  failure: LessonFailure | null;
  online: boolean;
}

export function lessonProblem(state: LessonPageState): LessonProblem | null {
  if (state.loaded && !state.hasSubject) {
    return { key: "lesson.notFound", retryable: false };
  }
  if (state.loaded && !state.hasTarget) {
    return { key: "lesson.topicMissing", retryable: false };
  }
  if (!state.failure) return null;
  if (state.failure === "failed") return { key: null, retryable: true };
  return {
    key: state.online ? "lesson.problem.unreachable" : "lesson.problem.offline",
    retryable: true,
  };
}
