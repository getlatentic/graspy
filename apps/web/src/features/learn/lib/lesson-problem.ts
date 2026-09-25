export interface LessonProblem {
  key: string;
  retryable: boolean;
}

interface LessonPageState {
  loaded: boolean;
  hasSubject: boolean;
  hasTarget: boolean;
  unreachable: boolean;
  online: boolean;
}

export function lessonProblem(state: LessonPageState): LessonProblem | null {
  if (state.loaded && !state.hasSubject) {
    return { key: "lesson.notFound", retryable: false };
  }
  if (state.loaded && !state.hasTarget) {
    return { key: "lesson.topicMissing", retryable: false };
  }
  if (!state.unreachable) return null;
  return {
    key: state.online ? "lesson.problem.unreachable" : "lesson.problem.offline",
    retryable: true,
  };
}
