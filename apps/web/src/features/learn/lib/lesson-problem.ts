import { SignInUnchecked } from "@/lib/api/errors";
import { isUnreachable } from "@/lib/mcp/unreachable";

export interface LessonProblem {
  /** What to say under "The lesson didn't load"; null when that is all there is to say. */
  key: string | null;
  retryable: boolean;
}

export type LessonFailure = "unreachable" | "failed";

// Google failing to check the sign-in is never the device's connection.
export function lessonFailure(error: unknown): LessonFailure {
  if (error instanceof SignInUnchecked && navigator.onLine) return "failed";
  return isUnreachable(error) ? "unreachable" : "failed";
}

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
