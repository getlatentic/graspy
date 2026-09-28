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
  /** The take has ended and is being kept on the device. */
  | { name: "saving"; move: LessonMove }
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
  | { type: "saving" }
  | { type: "recordFailed"; note: "micDenied" | "micFailed" | "notSaved" }
  | { type: "nothingHeard" }
  /** The take ended unsent, as the page was hidden or left: the turn is the child's again. */
  | { type: "recordCancelled" }
  | { type: "recorded"; key: string }
  /** An answer from before the page was reloaded, still to be shown. */
  | { type: "resumed"; move: LessonMove; key: string }
  | { type: "kept"; key: string; code: VoiceCode | null }
  | { type: "settled"; key: string; sent: Sent }
  /** The answer left the device with its outcome shown elsewhere. */
  | { type: "seenElsewhere"; key: string }
  /** The child carried on past an answer still kept, without its outcome. */
  | { type: "carriedOn"; key: string }
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

const onAnswer = (phase: Phase, key: string) =>
  (phase.name === "checking" || phase.name === "kept") && phase.key === key
    ? phase
    : null;

// A session naming no learner keeps the answer, and the lesson says what the child must do first.
function kept(
  state: LessonState,
  key: string,
  code: VoiceCode | null,
): LessonState {
  const phase = onAnswer(state.phase, key);
  if (!phase) return state;
  if (code === "learner_required")
    return { phase: { name: "failed" }, note: "learnerRequired" };
  return { phase: { name: "kept", move: phase.move, key }, note: null };
}

function settled(
  state: LessonState,
  event: Extract<LessonEvent, { type: "settled" }>,
): LessonState {
  const phase = onAnswer(state.phase, event.key);
  if (!phase) return state;
  const { sent } = event;
  if (sent.kind === "kept") return kept(state, event.key, sent.code);
  if (sent.kind === "refused") return refused(phase.move, sent.code);
  return {
    phase: { name: "result", move: phase.move, turn: sent.turn },
    note: null,
  };
}

function passed(state: LessonState, key: string): LessonState {
  const phase = onAnswer(state.phase, key);
  if (!phase) return state;
  return {
    phase: { name: "moving-on", move: phase.move, heard: false },
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
  return phase.name === "your-turn" ||
    phase.name === "recording" ||
    phase.name === "saving"
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
    case "saving":
      return state.phase.name === "recording"
        ? { phase: { name: "saving", move: state.phase.move }, note: null }
        : state;
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
    case "recordCancelled":
      return state.phase.name === "recording"
        ? { phase: { name: "your-turn", move: state.phase.move }, note: null }
        : state;
    case "recorded":
      return inTurn(state, (move) => ({
        phase: { name: "checking", move, key: event.key },
        note: null,
      }));
    case "resumed":
      return {
        phase: { name: "checking", move: event.move, key: event.key },
        note: null,
      };
    case "kept":
      return kept(state, event.key, event.code);
    case "settled":
      return settled(state, event);
    case "seenElsewhere":
    case "carriedOn":
      return passed(state, event.key);
    case "replied":
      return state.phase.name === "result"
        ? {
            phase: { name: "moving-on", move: state.phase.move, heard: false },
            note: null,
          }
        : state;
  }
}
