import { useEffect, type Dispatch } from "react";
import type { LessonEvent, LessonState } from "../lib/lesson-state";
import { nextStep, openingStep } from "../lib/lesson-steps";
import type { VoiceLearner } from "./use-voice-learner";

/** Fetches the step the teacher gives next, whenever the lesson loads or moves on. */
export function useLessonSteps(
  state: LessonState,
  dispatch: Dispatch<LessonEvent>,
  learner: VoiceLearner,
  plan: string | undefined,
): void {
  const { phase } = state;
  const { key, learnerClass, language } = learner;

  useEffect(() => {
    if (phase.name !== "loading" && phase.name !== "moving-on") return;
    let live = true;
    const asked = { key, learnerClass, language };
    const step =
      phase.name === "loading"
        ? openingStep(asked, plan)
        : nextStep(phase, asked, plan);
    step
      .then((event) => live && dispatch(event))
      .catch(() => live && dispatch({ type: "loadFailed" }));
    return () => {
      live = false;
    };
  }, [phase, dispatch, key, learnerClass, language, plan]);
}
