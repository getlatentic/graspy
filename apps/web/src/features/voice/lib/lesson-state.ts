import type { Sent } from "@/lib/voice/send-answer";
import type { VoiceCode } from "@/lib/voice/voice-api";
import type { LessonMove, MarkedTurn } from "@/lib/voice/voice-types";

/** One short line under the lesson: what went wrong, or what to do. */
export type Note =
  | "noSpeech"
  | "couldNotCheck"
  | "stepMoved"
  | "notArrived"
  | "unsupported"
  | "alreadySent"
  | "learnerRequired"
  | "voiceFailed"
  | "micDenied"
  | "micFailed"
  | "notSaved";

export type Phase =
  | { name: "idle" }
  | { name: "loading" }
  | { name: "failed" }
  | { name: "rest" }
  | { name: "teaching"; move: LessonMove }
  | { name: "your-turn"; move: LessonMove }
  | { name: "recording"; move: LessonMove }
  | { name: "checking"; move: LessonMove; key: string }
  | { name: "kept"; move: LessonMove; key: string }
  | { name: "result"; move: LessonMove; turn: MarkedTurn }
  /** `heard`: a line that asked nothing was heard, and the server is told before the next step. */
  | { name: "moving-on"; move: LessonMove; heard: boolean };

export interface LessonState {
  phase: Phase;
  note: Note | null;
}

export type LessonEvent =
  | { type: "start" }
  | { type: "loaded"; move: LessonMove }
  | { type: "loadFailed" }
  | { type: "taught"; spoken: "heard" | "failed" }
  | { type: "recordStarted" }
  | { type: "recordFailed"; note: "micDenied" | "micFailed" | "notSaved" }
  | { type: "nothingHeard" }
  | { type: "recorded"; key: string }
  | { type: "kept"; key: string }
  | { type: "settled"; key: string; sent: Sent }
  | { type: "replied" };

export const START: LessonState = { phase: { name: "idle" }, note: null };

// As the Android app answers each refusal: take the step the server gives now, or ask again.
function refused(move: LessonMove, code: VoiceCode | null): LessonState {
  const again = (note: Note): LessonState => ({
    phase: { name: "your-turn", move },
    note,
  });
  const onward = (note: Note): LessonState => ({
    phase: { name: "moving-on", move, heard: false },
    note,
  });
  switch (code) {
    case "no_speech":
      return again("noSpeech");
    case "audio_not_ready":
      return again("notArrived");
    case "idempotency_conflict":
      return again("alreadySent");
    case "step_not_offered":
      return onward("stepMoved");
    case "unsupported_prompt":
      return onward("unsupported");
    case "learner_required":
      return { phase: { name: "failed" }, note: "learnerRequired" };
    default:
      return again("couldNotCheck");
  }
}

function settled(
  state: LessonState,
  event: Extract<LessonEvent, { type: "settled" }>,
): LessonState {
  const { phase } = state;
  if (phase.name !== "checking" && phase.name !== "kept") return state;
  if (phase.key !== event.key) return state;
  if (event.sent.kind === "kept") {
    return {
      phase: { name: "kept", move: phase.move, key: phase.key },
      note: null,
    };
  }
  if (event.sent.kind === "refused")
    return refused(phase.move, event.sent.code);
  return {
    phase: { name: "result", move: phase.move, turn: event.sent.turn },
    note: null,
  };
}

function loaded(state: LessonState, move: LessonMove): LessonState {
  const phase: Phase =
    move.kind === "rest" ? { name: "rest" } : { name: "teaching", move };
  return { phase, note: state.note };
}

function taught(state: LessonState, spoken: "heard" | "failed"): LessonState {
  if (state.phase.name !== "teaching") return state;
  const { move } = state.phase;
  const note = spoken === "failed" ? "voiceFailed" : null;
  if (move.activity) return { phase: { name: "your-turn", move }, note };
  return { phase: { name: "moving-on", move, heard: true }, note };
}

function inTurn(state: LessonState, next: (move: LessonMove) => LessonState) {
  const { phase } = state;
  return phase.name === "your-turn" || phase.name === "recording"
    ? next(phase.move)
    : state;
}

export function lessonReducer(
  state: LessonState,
  event: LessonEvent,
): LessonState {
  switch (event.type) {
    case "start":
      return { phase: { name: "loading" }, note: null };
    case "loaded":
      return loaded(state, event.move);
    case "loadFailed":
      return { phase: { name: "failed" }, note: state.note };
    case "taught":
      return taught(state, event.spoken);
    case "recordStarted":
      return inTurn(state, (move) => ({
        phase: { name: "recording", move },
        note: null,
      }));
    case "recordFailed":
      return inTurn(state, (move) => ({
        phase: { name: "your-turn", move },
        note: event.note,
      }));
    case "nothingHeard":
      return inTurn(state, (move) => ({
        phase: { name: "your-turn", move },
        note: "noSpeech",
      }));
    case "recorded":
      return inTurn(state, (move) => ({
        phase: { name: "checking", move, key: event.key },
        note: null,
      }));
    case "kept":
      return settled(state, {
        type: "settled",
        key: event.key,
        sent: { kind: "kept" },
      });
    case "settled":
      return settled(state, event);
    case "replied":
      return state.phase.name === "result"
        ? {
            phase: { name: "moving-on", move: state.phase.move, heard: false },
            note: null,
          }
        : state;
  }
}
