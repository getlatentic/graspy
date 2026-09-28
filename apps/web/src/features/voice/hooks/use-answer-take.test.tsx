// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeMicrophone, showPage } from "@/lib/voice/microphone.fake";
import { ASKED } from "@/lib/voice/voice-worker.fake";
import type { LessonEvent, Phase } from "../lib/lesson-state";
import { useAnswerTake } from "./use-answer-take";

const { keepAnswer } = vi.hoisted(() => ({
  keepAnswer: vi.fn(async (_answer: unknown, wanted: () => boolean) => {
    wanted();
  }),
}));
vi.mock("@/lib/voice/answer-store", async (actual) => ({
  ...(await actual<typeof import("@/lib/voice/answer-store")>()),
  keepAnswer,
}));

const LEARNER = {
  key: "learner-1",
  speaker: "device-1",
  learnerClass: "nursery-2",
  language: "en" as const,
};
const YOUR_TURN: Phase = { name: "your-turn", move: ASKED };

let microphone: ReturnType<typeof fakeMicrophone>;
let dispatch: ReturnType<typeof vi.fn<(event: LessonEvent) => void>>;

beforeEach(() => {
  showPage("visible");
  microphone = fakeMicrophone();
  dispatch = vi.fn<(event: LessonEvent) => void>();
  keepAnswer.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const lesson = () =>
  renderHook(() => useAnswerTake(YOUR_TURN, dispatch, LEARNER));

async function recording(take: ReturnType<typeof lesson>) {
  let answered: Promise<void> = Promise.resolve();
  act(() => {
    answered = take.result.current.record(ASKED);
  });
  await vi.waitFor(() =>
    expect(dispatch).toHaveBeenCalledWith({ type: "recordStarted" }),
  );
  // Wrapped, since an async function returning a promise would wait for the whole answer.
  return { answered };
}

describe("a spoken answer when the lesson goes out of sight", () => {
  it("ends unsent, releases the microphone and gives the child the turn again", async () => {
    const { answered } = await recording(lesson());
    microphone.speak(5);

    showPage("hidden");

    expect(microphone.track.stop).toHaveBeenCalledOnce();
    await act(() => answered);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "recordCancelled" });
    expect(keepAnswer).not.toHaveBeenCalled();
  });

  it("keeps an answer that was already being saved", async () => {
    const take = lesson();
    const { answered } = await recording(take);
    microphone.speak(5);

    take.result.current.stop();
    showPage("hidden");
    await act(() => answered);

    expect(keepAnswer).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: "saving" });
    expect(dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "recorded" }),
    );
  });

  it("releases a microphone that opens after the lesson closed", async () => {
    const allow = microphone.ask();
    const take = lesson();
    act(() => void take.result.current.record(ASKED));

    take.unmount();
    allow();

    await vi.waitFor(() =>
      expect(microphone.track.stop).toHaveBeenCalledOnce(),
    );
    expect(keepAnswer).not.toHaveBeenCalled();
  });
});
