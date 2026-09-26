import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import { keepAndSend, onAnswerSettled } from "@/lib/voice/answer-outbox";
import { startTake, type Take } from "@/lib/voice/recorder";
import type { LessonMove } from "@/lib/voice/voice-types";
import { answerMetadata } from "../lib/lesson-answer";
import type { LessonEvent } from "../lib/lesson-state";
import type { VoiceLearner } from "./use-voice-learner";

/** How many tenths of a second of loudness the voice wave shows. */
const WAVE_BARS = 28;

const microphoneRefused = (error: unknown) =>
  error instanceof DOMException &&
  (error.name === "NotAllowedError" || error.name === "SecurityError");

async function answer(
  wav: Blob,
  move: LessonMove,
  learner: VoiceLearner,
  dispatch: Dispatch<LessonEvent>,
) {
  const key = crypto.randomUUID();
  dispatch({ type: "recorded", key });
  const kept = {
    key,
    learner: learner.key,
    metadata: answerMetadata(move, learner),
    wav,
    keptAt: Date.now(),
  };
  try {
    const sent = await keepAndSend(kept);
    dispatch(
      sent.kind === "kept"
        ? { type: "kept", key }
        : { type: "settled", key, sent },
    );
  } catch {
    dispatch({ type: "recordFailed", note: "notSaved" });
  }
}

/** The child's spoken answer: recorded, kept on the device, sent and marked. */
export function useAnswerTake(
  dispatch: Dispatch<LessonEvent>,
  learner: VoiceLearner,
) {
  const take = useRef<Take | null>(null);
  const [levels, setLevels] = useState<number[]>([]);

  useEffect(() => () => take.current?.cancel(), []);
  useEffect(
    () =>
      onAnswerSettled((key, sent) => dispatch({ type: "settled", key, sent })),
    [dispatch],
  );

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
        await answer(result.wav, move, learner, dispatch);
    },
    [dispatch, learner],
  );

  return { record, stop: () => take.current?.stop(), levels };
}
