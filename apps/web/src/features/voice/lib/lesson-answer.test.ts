import { describe, expect, it, vi } from "vitest";
import type { LessonMove } from "@/lib/voice/voice-types";
import { answerMetadata, answerToKeep, keepTake } from "./lesson-answer";
import { lessonReducer, START, type LessonEvent } from "./lesson-state";

const move = (kind: string, prompt: string): LessonMove => ({
  kind: "event",
  plan_id: "plan.x",
  event_id: "e3",
  subject: "mathematics",
  say: "plan.x.e3",
  activity: { kind, prompt_id: prompt },
});

const learner = {
  speaker: "dev-1",
  learnerClass: "primary_3",
  language: "yo" as const,
};

describe("answerMetadata", () => {
  it("files a times-table answer as reasoning about multiplication", () => {
    expect(
      answerMetadata(move("existing", "mul_fact_7x8_answer"), learner),
    ).toMatchObject({
      task: "reasoning",
      topic: "multiplication",
      prompt_id: "mul_fact_7x8_answer",
    });
  });

  it("files a said list as a recitation of its subject, and any other answer as reasoning", () => {
    expect(
      answerMetadata(move("sequence", "plan.x.e3"), learner),
    ).toMatchObject({
      task: "recitation",
      topic: "mathematics",
    });
    expect(answerMetadata(move("answer", "plan.x.e3"), learner)).toMatchObject({
      task: "reasoning",
      topic: "mathematics",
    });
  });

  it("names the step, the learner, the language and the consent", () => {
    expect(answerMetadata(move("answer", "plan.x.e3"), learner)).toEqual({
      speaker_id: "dev-1",
      language_pair: "yo-en",
      spoken_language: "yo",
      lesson_language: "yo",
      learner_class: "primary_3",
      task: "reasoning",
      topic: "mathematics",
      prompt_id: "plan.x.e3",
      plan_id: "plan.x",
      event_id: "e3",
      device: "web",
      consent: { granted: true, scope: "voice_lesson" },
    });
  });
});

describe("answerToKeep", () => {
  it("keeps the step the answer was given for with its recording, so a reload can show it", () => {
    const step = move("answer", "plan.x.e3");
    const wav = new Blob(["RIFF"], { type: "audio/wav" });
    expect(
      answerToKeep(step, { ...learner, key: "device/dev-1" }, wav, "k1", 7),
    ).toEqual({
      key: "k1",
      learner: "device/dev-1",
      move: step,
      metadata: answerMetadata(step, learner),
      wav,
      keptAt: 7,
    });
  });
});

describe("keepTake", () => {
  const step = move("answer", "plan.x.e3");
  const kept = answerToKeep(
    step,
    { ...learner, key: "device/dev-1" },
    new Blob(["RIFF"], { type: "audio/wav" }),
    "k1",
    7,
  );
  const recording = [
    { type: "start" },
    { type: "loaded", move: step },
    { type: "taught", spoken: "heard" },
    { type: "recordStarted" },
  ] satisfies LessonEvent[];

  async function lessonAfter(
    keep: () => Promise<void>,
    pause?: () => Promise<unknown>,
  ) {
    let state = recording.reduce(lessonReducer, START);
    await keepTake(
      kept,
      { keep, forget: async () => {} },
      (event) => {
        state = lessonReducer(state, event);
      },
      pause,
    );
    return state;
  }

  it("lets go a take that is saved only after the child was told it was not", async () => {
    let landed = () => {};
    const forgotten: string[] = [];
    const emitted: LessonEvent[] = [];
    await keepTake(
      kept,
      {
        keep: () => new Promise<void>((resolve) => (landed = resolve)),
        forget: async (key) => void forgotten.push(key),
      },
      (event) => emitted.push(event),
      async () => {},
    );
    expect(emitted).toEqual([{ type: "recordFailed", note: "notSaved" }]);

    landed();
    await vi.waitFor(() => expect(forgotten).toEqual(["k1"]));
  });

  it("gives the turn back, saying so, when the device never answers", async () => {
    const state = await lessonAfter(
      () => new Promise(() => {}),
      async () => {},
    );
    expect(state).toEqual({
      phase: { name: "your-turn", move: step },
      note: "notSaved",
    });
  });

  it("checks the take once it is kept", async () => {
    const state = await lessonAfter(async () => {});
    expect(state.phase).toEqual({ name: "checking", move: step, key: "k1" });
  });

  it("gives the turn back, saying so, when the device cannot keep the take", async () => {
    const state = await lessonAfter(async () => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(state).toEqual({
      phase: { name: "your-turn", move: step },
      note: "notSaved",
    });
  });
});
