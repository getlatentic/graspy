import { describe, expect, it } from "vitest";
import type { LessonMove, MarkedTurn } from "@/lib/voice/voice-types";
import {
  lessonReducer,
  START,
  type LessonEvent,
  type LessonState,
} from "./lesson-state";

const TAUGHT: LessonMove = {
  kind: "event",
  plan_id: "plan.mul.table-7",
  event_id: "e1",
  event: "present_content",
  say: "plan.mul.table-7.e1",
  say_text: { en: "Seven times eight is fifty-six." },
};
const ASKED: LessonMove = {
  ...TAUGHT,
  event_id: "e2",
  event: "elicit_performance",
  say: "plan.mul.table-7.e2",
  activity: { kind: "existing", prompt_id: "mul_fact_7x8_answer" },
};
const TURN: MarkedTurn = {
  sample_id: "gvm_1",
  state: "complete",
  transcript: "fifty six",
  decision: "correct",
  feedback: "Well done.",
  provider: "intron_sync",
  latency_ms: 800,
};

const run = (...events: LessonEvent[]): LessonState =>
  events.reduce(lessonReducer, START);

const toYourTurn: LessonEvent[] = [
  { type: "start" },
  { type: "loaded", move: ASKED },
  { type: "taught", spoken: "heard" },
];

describe("a voice lesson", () => {
  it("waits for the child's tap, then loads and teaches the step", () => {
    expect(START.phase.name).toBe("idle");
    expect(run({ type: "start" }).phase.name).toBe("loading");
    expect(
      run({ type: "start" }, { type: "loaded", move: TAUGHT }).phase,
    ).toEqual({
      name: "teaching",
      move: TAUGHT,
    });
  });

  it("moves on by itself after a line that asks nothing, telling the server it was heard", () => {
    const state = run(
      { type: "start" },
      { type: "loaded", move: TAUGHT },
      { type: "taught", spoken: "heard" },
    );
    expect(state.phase).toEqual({
      name: "moving-on",
      move: TAUGHT,
      heard: true,
    });
  });

  it("gives the child the turn after a line that asks a question", () => {
    expect(run(...toYourTurn).phase.name).toBe("your-turn");
  });

  it("goes on with the words on screen when her voice does not load", () => {
    const state = run(
      { type: "start" },
      { type: "loaded", move: ASKED },
      { type: "taught", spoken: "failed" },
    );
    expect(state).toMatchObject({
      phase: { name: "your-turn" },
      note: "voiceFailed",
    });
  });

  it("records, checks, shows the marked turn and moves on once she has replied", () => {
    const marked = run(
      ...toYourTurn,
      { type: "recordStarted" },
      { type: "recorded", key: "k1" },
      { type: "settled", key: "k1", sent: { kind: "marked", turn: TURN } },
    );
    expect(marked.phase).toEqual({ name: "result", move: ASKED, turn: TURN });
    expect(lessonReducer(marked, { type: "replied" }).phase).toEqual({
      name: "moving-on",
      move: ASKED,
      heard: false,
    });
  });

  it("keeps an answer it could not send, and shows it marked once it is", () => {
    const kept = run(
      ...toYourTurn,
      { type: "recordStarted" },
      { type: "recorded", key: "k1" },
      { type: "kept", key: "k1" },
    );
    expect(kept.phase.name).toBe("kept");
    const later = lessonReducer(kept, {
      type: "settled",
      key: "k1",
      sent: { kind: "marked", turn: TURN },
    });
    expect(later.phase.name).toBe("result");
  });

  it("opens on an answer from before a reload, checking it, then shows its result", () => {
    const resumed = run(
      { type: "start" },
      { type: "resumed", move: ASKED, key: "k1" },
    );
    expect(resumed).toEqual({
      phase: { name: "checking", move: ASKED, key: "k1" },
      note: null,
    });
    const marked = lessonReducer(resumed, {
      type: "settled",
      key: "k1",
      sent: { kind: "marked", turn: TURN },
    });
    expect(marked.phase).toEqual({ name: "result", move: ASKED, turn: TURN });
  });

  it("ignores another answer's result", () => {
    const checking = run(
      ...toYourTurn,
      { type: "recordStarted" },
      { type: "recorded", key: "k1" },
    );
    const other = lessonReducer(checking, {
      type: "settled",
      key: "k0",
      sent: { kind: "marked", turn: TURN },
    });
    expect(other).toBe(checking);
  });

  it("gives the turn back when nobody spoke, or the microphone would not open", () => {
    expect(
      run(...toYourTurn, { type: "recordStarted" }, { type: "nothingHeard" }),
    ).toMatchObject({
      phase: { name: "your-turn" },
      note: "noSpeech",
    });
    expect(
      run(...toYourTurn, { type: "recordFailed", note: "micDenied" }),
    ).toMatchObject({ phase: { name: "your-turn" }, note: "micDenied" });
  });

  it.each([
    ["no_speech", "your-turn", "noSpeech"],
    ["provider_failure", "your-turn", "couldNotCheck"],
    ["audio_not_ready", "your-turn", "notArrived"],
    ["idempotency_conflict", "your-turn", "alreadySent"],
    ["step_not_offered", "moving-on", "stepMoved"],
    ["unsupported_prompt", "moving-on", "unsupported"],
    ["learner_required", "failed", "learnerRequired"],
  ] as const)(
    "answers a %s refusal with %s and one line",
    (code, phase, note) => {
      const state = run(
        ...toYourTurn,
        { type: "recordStarted" },
        { type: "recorded", key: "k1" },
        {
          type: "settled",
          key: "k1",
          sent: { kind: "refused", code, status: 409 },
        },
      );
      expect(state).toMatchObject({ phase: { name: phase }, note });
    },
  );

  it("rests when nothing is due today", () => {
    const rest: LessonMove = { kind: "rest", say: "finished" };
    expect(
      run({ type: "start" }, { type: "loaded", move: rest }).phase.name,
    ).toBe("rest");
  });
});
