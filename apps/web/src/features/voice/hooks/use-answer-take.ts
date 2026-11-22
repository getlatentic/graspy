import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import { cueForDecision } from "@/features/haptics/lib/answer-cue";
import { haptics } from "@/features/haptics/lib/haptics";
import { keepAnswer } from "@/lib/voice/answer-store";
import { startTake, type Take } from "@/lib/voice/recorder";
import type { LessonMove } from "@/lib/voice/voice-types";
import { carryOn, followAnswer } from "../lib/follow-answer";
import { answerToKeep, keepTake } from "../lib/lesson-answer";
import type { LessonEvent, Phase } from "../lib/lesson-state";
import type { VoiceLearner } from "./use-voice-learner";

/** How many tenths of a second of loudness the voice wave shows. */
const WAVE_BARS = 28;

/** A television's browser often has no microphone to ask for: there is no getUserMedia at all. */
const microphoneMissing = () =>
  typeof navigator.mediaDevices?.getUserMedia !== "function";

const microphoneRefused = (error: unknown) =>
  error instanceof DOMException &&
  (error.name === "NotAllowedError" || error.name === "SecurityError");

const awaited = (phase: Phase) =>
  phase.name === "checking" || phase.name === "kept" ? phase.key : null;

/** A turn is felt as it is marked, never as a result is shown again by a remount or a re-render. */
const feltThenDispatched =
  (dispatch: Dispatch<LessonEvent>): Dispatch<LessonEvent> =>
  (event) => {
    if (event.type === "settled" && event.sent.kind === "marked") {
      const cue = cueForDecision(event.sent.turn.decision);
      if (cue) haptics.trigger(cue);
    }
    dispatch(event);
  };

/** The child's spoken answer: recorded, kept on the device, sent and marked. */
export function useAnswerTake(
  phase: Phase,
  dispatch: Dispatch<LessonEvent>,
  learner: VoiceLearner,
) {
  const take = useRef<Take | null>(null);
  const left = useRef(false);
  const starting = useRef(false);
  const [levels, setLevels] = useState<number[]>([]);
  const waiting = awaited(phase);

  useEffect(() => {
    left.current = false;
    return () => {
      left.current = true;
      take.current?.cancel();
    };
  }, []);
  useEffect(() => {
    if (!waiting) return;
    const stop = new AbortController();
    followAnswer(waiting, feltThenDispatched(dispatch), stop.signal).catch(
      (error) => console.warn("Following an answer failed:", error),
    );
    return () => stop.abort();
  }, [waiting, dispatch]);

  const record = useCallback(
    async (move: LessonMove) => {
      // A second request while a take is opening or open would orphan the first.
      if (starting.current || take.current) return;
      setLevels([]);
      starting.current = true;
      try {
        take.current = await startTake((level) =>
          setLevels((shown) => [...shown, level].slice(-WAVE_BARS)),
        );
        starting.current = false;
      } catch (error) {
        starting.current = false;
        const note = microphoneRefused(error)
          ? "micDenied"
          : microphoneMissing()
            ? "micMissing"
            : "micFailed";
        dispatch({ type: "recordFailed", note });
        return;
      }
      // The lesson can close while the microphone is being opened.
      if (left.current) take.current.cancel();
      dispatch({ type: "recordStarted" });
      const result = await take.current.done;
      take.current = null;
      if (result.kind === "nothing") dispatch({ type: "nothingHeard" });
      if (result.kind === "cancelled") dispatch({ type: "recordCancelled" });
      if (result.kind !== "answer") return;
      const key = crypto.randomUUID();
      const kept = answerToKeep(move, learner, result.wav, key, Date.now());
      await keepTake(kept, { keep: keepAnswer }, dispatch);
    },
    [dispatch, learner],
  );

  return {
    record,
    stop: () => take.current?.stop(),
    carryOn: () =>
      phase.name === "kept" && void carryOn(phase.key, learner.key, dispatch),
    levels,
  };
}
