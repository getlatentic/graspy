import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import { keepAnswer } from "@/lib/voice/answer-store";
import { startTake, type Take } from "@/lib/voice/recorder";
import type { LessonMove } from "@/lib/voice/voice-types";
import { followAnswer } from "../lib/follow-answer";
import { answerToKeep } from "../lib/lesson-answer";
import type { LessonEvent, Phase } from "../lib/lesson-state";
import type { VoiceLearner } from "./use-voice-learner";

/** How many tenths of a second of loudness the voice wave shows. */
const WAVE_BARS = 28;

const microphoneRefused = (error: unknown) =>
  error instanceof DOMException &&
  (error.name === "NotAllowedError" || error.name === "SecurityError");

const awaited = (phase: Phase) =>
  phase.name === "checking" || phase.name === "kept" ? phase.key : null;

/** Kept on the device first, so nothing the child said is lost to the network. */
async function keep(
  wav: Blob,
  move: LessonMove,
  learner: VoiceLearner,
  dispatch: Dispatch<LessonEvent>,
) {
  const key = crypto.randomUUID();
  try {
    await keepAnswer(answerToKeep(move, learner, wav, key, Date.now()));
  } catch {
    dispatch({ type: "recordFailed", note: "notSaved" });
    return;
  }
  dispatch({ type: "recorded", key });
}

/** The child's spoken answer: recorded, kept on the device, sent and marked. */
export function useAnswerTake(
  phase: Phase,
  dispatch: Dispatch<LessonEvent>,
  learner: VoiceLearner,
) {
  const take = useRef<Take | null>(null);
  const [levels, setLevels] = useState<number[]>([]);
  const waiting = awaited(phase);

  useEffect(() => () => take.current?.cancel(), []);
  useEffect(() => {
    if (!waiting) return;
    const stop = new AbortController();
    followAnswer(waiting, dispatch, stop.signal).catch((error) =>
      console.warn("Following an answer failed:", error),
    );
    return () => stop.abort();
  }, [waiting, dispatch]);

  const record = useCallback(
    async (move: LessonMove) => {
      setLevels([]);
      try {
        take.current = await startTake((level) =>
          setLevels((shown) => [...shown, level].slice(-WAVE_BARS)),
        );
      } catch (error) {
        const note = microphoneRefused(error) ? "micDenied" : "micFailed";
        dispatch({ type: "recordFailed", note });
        return;
      }
      dispatch({ type: "recordStarted" });
      const result = await take.current.done;
      take.current = null;
      if (result.kind === "nothing") dispatch({ type: "nothingHeard" });
      if (result.kind === "answer")
        await keep(result.wav, move, learner, dispatch);
    },
    [dispatch, learner],
  );

  return { record, stop: () => take.current?.stop(), levels };
}
