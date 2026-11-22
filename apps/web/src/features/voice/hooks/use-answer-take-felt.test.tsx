// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { haptics } from "@/features/haptics/lib/haptics";
import type { Decision, MarkedTurn } from "@/lib/voice/voice-types";
import { ASKED } from "@/lib/voice/voice-worker.fake";
import type { LessonEvent, Phase } from "../lib/lesson-state";
import { useAnswerTake } from "./use-answer-take";

const { followAnswer } = vi.hoisted(() => ({ followAnswer: vi.fn() }));
vi.mock("../lib/follow-answer", () => ({ followAnswer, carryOn: vi.fn() }));

const LEARNER = {
  key: "learner-1",
  speaker: "device-1",
  learnerClass: "nursery-2",
  language: "en" as const,
};
const CHECKING: Phase = { name: "checking", move: ASKED, key: "k1" };

afterEach(() => {
  cleanup();
  followAnswer.mockReset();
});

const turn = (decision: Decision): MarkedTurn => ({
  sample_id: "s",
  state: "complete",
  transcript: "t",
  decision,
  feedback: "f",
  provider: "p",
  latency_ms: 1,
});

function marking(event: LessonEvent) {
  followAnswer.mockImplementation(async (_key, emit) => emit(event));
  const trigger = vi.spyOn(haptics, "trigger").mockImplementation(() => {});
  const dispatch = vi.fn();
  const view = renderHook(
    ({ phase }: { phase: Phase }) => useAnswerTake(phase, dispatch, LEARNER),
    { initialProps: { phase: CHECKING } },
  );
  return { trigger, dispatch, view };
}

const settled = (decision: Decision): LessonEvent => ({
  type: "settled",
  key: "k1",
  sent: { kind: "marked", turn: turn(decision) },
});

describe("a spoken answer being marked", () => {
  it.each([
    ["correct", "correct"],
    ["try_again", "wrong"],
  ] as const)("feels %s as the turn is marked, once", (decision, cue) => {
    const { trigger, dispatch, view } = marking(settled(decision));
    expect(trigger).toHaveBeenCalledExactlyOnceWith(cue);
    expect(dispatch).toHaveBeenCalledWith(settled(decision));
    view.rerender({ phase: CHECKING });
    view.rerender({
      phase: { name: "result", move: ASKED, turn: turn(decision) },
    });
    expect(trigger).toHaveBeenCalledOnce();
  });

  it("feels nothing for a line that was not understood, or an answer still kept", () => {
    const heard = marking(settled("not_understood"));
    expect(heard.trigger).not.toHaveBeenCalled();
    cleanup();
    const kept = marking({ type: "kept", key: "k1", code: null });
    expect(kept.trigger).not.toHaveBeenCalled();
  });

  it("feels nothing when a result is already on screen at mount", () => {
    const trigger = vi.spyOn(haptics, "trigger").mockImplementation(() => {});
    renderHook(() =>
      useAnswerTake(
        { name: "result", move: ASKED, turn: turn("correct") },
        vi.fn(),
        LEARNER,
      ),
    );
    expect(followAnswer).not.toHaveBeenCalled();
    expect(trigger).not.toHaveBeenCalled();
  });
});
