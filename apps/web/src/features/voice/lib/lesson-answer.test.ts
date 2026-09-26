import { describe, expect, it } from "vitest";
import type { LessonMove } from "@/lib/voice/voice-types";
import { answerMetadata, answerToKeep } from "./lesson-answer";

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
