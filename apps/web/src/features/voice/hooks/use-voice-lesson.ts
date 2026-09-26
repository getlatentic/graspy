import { useReducer } from "react";
import { lessonReducer, START } from "../lib/lesson-state";
import { useAnswerTake } from "./use-answer-take";
import { useLessonSteps } from "./use-lesson-steps";
import { useTeacherLines } from "./use-teacher-lines";
import type { VoiceLearner } from "./use-voice-learner";

/** One voice lesson: the teacher speaks, the child answers aloud, she marks it and replies. */
export function useVoiceLesson(
  learner: VoiceLearner,
  plan: string | undefined,
) {
  const [state, dispatch] = useReducer(lessonReducer, START);
  useLessonSteps(state, dispatch, learner, plan);
  const lines = useTeacherLines(state, dispatch, learner.language);
  const take = useAnswerTake(state.phase, dispatch, learner);

  const start = () => {
    lines.unlock();
    dispatch({ type: "start" });
  };
  const retry = () => dispatch({ type: "start" });

  return { state, start, retry, hearAgain: lines.hearAgain, ...take };
}
