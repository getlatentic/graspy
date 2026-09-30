import { useEffect, useRef, type Dispatch } from "react";
import { replyAudio, teacherAudio } from "@/lib/voice/voice-api";
import { TeacherVoice } from "@/lib/voice/teacher-voice";
import type { LessonLanguage } from "@/lib/voice/voice-types";
import type { LessonEvent, LessonState } from "../lib/lesson-state";

/** Her line for a take in which nobody spoke. */
const NO_SPEECH = "no-speech";

/** The line on screen now, as audio: the step's own, or her reply to the answer just marked. */
function currentLine(state: LessonState, language: LessonLanguage) {
  const { phase } = state;
  if (phase.name === "teaching" || phase.name === "rest")
    return () => teacherAudio(phase.move.say, language);
  if (phase.name === "result") return () => replyAudio(phase.turn.sample_id);
  if (phase.name === "your-turn" && state.note === "noSpeech")
    return () => teacherAudio(NO_SPEECH, language);
  return null;
}

/** She says each step, her reply to each answer, and a word when she heard nothing. */
export function useTeacherLines(
  state: LessonState,
  dispatch: Dispatch<LessonEvent>,
  language: LessonLanguage,
) {
  const voice = useRef<TeacherVoice | null>(null);
  voice.current ??= new TeacherVoice();
  const { phase } = state;

  useEffect(() => () => voice.current?.close(), []);

  useEffect(() => {
    const line = currentLine({ phase, note: state.note }, language);
    if (!line) return;
    let live = true;
    void voice.current!.say(line).then((spoken) => {
      if (!live) return;
      if (phase.name === "teaching") dispatch({ type: "taught", spoken });
      if (phase.name === "result") dispatch({ type: "replied" });
    });
    return () => {
      live = false;
      voice.current?.stop();
    };
  }, [phase, state.note, dispatch, language]);

  return {
    unlock: () => voice.current!.unlock(),
    /** On the child's turn: the step's question once more. */
    hearAgain: () => {
      const { phase: now } = state;
      if (now.name !== "your-turn") return;
      void voice.current!.say(() => teacherAudio(now.move.say, language));
    },
  };
}
