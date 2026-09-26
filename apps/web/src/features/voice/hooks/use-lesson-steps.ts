import { useEffect, type Dispatch } from "react";
import {
  lessonEventHeard,
  lessonMove,
  VoiceError,
} from "@/lib/voice/voice-api";
import type { LessonMove } from "@/lib/voice/voice-types";
import type { LessonEvent, LessonState } from "../lib/lesson-state";
import type { VoiceLearner } from "./use-voice-learner";

/** A breath between her last word and the next step: long enough to land, short enough not to wait on. */
const TURN_PAUSE_MS = 1_500;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A step the server moved past answers 409: the next step is what matters.
async function tellHeard(move: LessonMove, learnerClass: string) {
  try {
    await lessonEventHeard({
      plan_id: move.plan_id!,
      event_id: move.event_id!,
      learner_class: learnerClass,
    });
  } catch (error) {
    if (!(error instanceof VoiceError) || error.code !== "step_not_offered")
      throw error;
  }
}

/** Fetches the step the teacher gives next, whenever the lesson loads or moves on. */
export function useLessonSteps(
  state: LessonState,
  dispatch: Dispatch<LessonEvent>,
  learner: VoiceLearner,
  plan: string | undefined,
): void {
  const { phase } = state;
  const { learnerClass, language } = learner;

  useEffect(() => {
    if (phase.name !== "loading" && phase.name !== "moving-on") return;
    let live = true;
    const next = async () => {
      if (phase.name === "moving-on") {
        if (phase.heard) await tellHeard(phase.move, learnerClass);
        await pause(TURN_PAUSE_MS);
      }
      return lessonMove(learnerClass, language, plan);
    };
    next()
      .then(({ move }) => live && dispatch({ type: "loaded", move }))
      .catch(() => live && dispatch({ type: "loadFailed" }));
    return () => {
      live = false;
    };
  }, [phase, dispatch, learnerClass, language, plan]);
}
