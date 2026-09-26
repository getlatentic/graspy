import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeptAnswer, Settled } from "./answer-store";
import { sendAnswer, type AnswerApi } from "./send-answer";
import { VoiceError, type VoiceCode } from "./voice-api";
import type { MarkedTurn } from "./voice-types";

const answer: KeptAnswer = {
  key: "key-1",
  learner: "device/abc",
  metadata: {
    speaker_id: "abc",
    language_pair: "pcm-en",
    spoken_language: "en",
    lesson_language: "en",
    learner_class: "primary_4",
    task: "reasoning",
    topic: "multiplication",
    prompt_id: "mul_fact_7x8_answer",
    device: "web",
    consent: { granted: true, scope: "voice_lesson" },
  },
  wav: new Blob(["RIFF"], { type: "audio/wav" }),
  keptAt: 1,
};

const TURN: MarkedTurn = {
  sample_id: "gvm_1",
  state: "complete",
  transcript: "fifty six",
  decision: "correct",
  feedback: "Well done.",
  provider: "intron_sync",
  latency_ms: 900,
};

let api: { [K in keyof AnswerApi]: ReturnType<typeof vi.fn> };
let kept: Map<string, KeptAnswer>;
let settled: Map<string, Settled>;
const keeping = {
  keep: async (a: KeptAnswer) => void kept.set(a.key, a),
  settle: async (a: KeptAnswer, sent: Settled) => {
    kept.delete(a.key);
    settled.set(a.key, sent);
  },
};
const noPause = async () => {};

beforeEach(() => {
  kept = new Map([[answer.key, answer]]);
  settled = new Map();
  api = {
    createSample: vi.fn().mockResolvedValue({
      sample_id: "gvm_1",
      state: "awaiting_audio",
      upload_path: "/api/voice/samples/gvm_1/audio",
    }),
    uploadAudio: vi
      .fn()
      .mockResolvedValue({ sample_id: "gvm_1", state: "ready" }),
    evaluate: vi.fn().mockResolvedValue(TURN),
  };
});

const send = (a = answer) =>
  sendAnswer(a, api as unknown as AnswerApi, keeping, noPause);

describe("sendAnswer", () => {
  it("creates, uploads and marks the answer, then keeps only its outcome", async () => {
    await expect(send()).resolves.toEqual({ kind: "marked", turn: TURN });
    expect(api.createSample).toHaveBeenCalledWith("key-1", answer.metadata);
    expect(api.uploadAudio).toHaveBeenCalledWith(
      "/api/voice/samples/gvm_1/audio",
      answer.wav,
    );
    expect(api.evaluate).toHaveBeenCalledWith("gvm_1");
    expect(kept.size).toBe(0);
    expect(settled.get("key-1")).toEqual({ kind: "marked", turn: TURN });
  });

  it("keeps the answer when the server cannot be reached, and resumes after the upload", async () => {
    api.evaluate.mockRejectedValueOnce(new VoiceError("offline", 0, null));
    await expect(send()).resolves.toEqual({
      kind: "kept",
      status: 0,
      code: null,
    });
    const resumed = kept.get("key-1")!;
    expect(resumed).toMatchObject({ sampleId: "gvm_1", uploaded: true });

    await expect(send(resumed)).resolves.toMatchObject({ kind: "marked" });
    expect(api.createSample).toHaveBeenCalledTimes(1);
    expect(api.uploadAudio).toHaveBeenCalledTimes(1);
  });

  it("keeps the answer at once when the server names a wait longer than its polling", async () => {
    api.evaluate.mockResolvedValue({
      sample_id: "gvm_1",
      state: "processing",
      retry_after_ms: 100_000,
    });
    await expect(send()).resolves.toEqual({
      kind: "kept",
      status: 202,
      code: null,
      retryAfterMs: 100_000,
    });
    expect(api.evaluate).toHaveBeenCalledTimes(1);
  });

  it("waits out a short wait the server names, then asks again", async () => {
    const pause = vi.fn(async () => {});
    api.evaluate
      .mockResolvedValueOnce({
        sample_id: "gvm_1",
        state: "processing",
        retry_after_ms: 10_000,
      })
      .mockResolvedValueOnce(TURN);
    await expect(
      sendAnswer(answer, api as unknown as AnswerApi, keeping, pause),
    ).resolves.toMatchObject({ kind: "marked" });
    expect(pause).toHaveBeenCalledWith(10_000);
  });

  it("asks again while another request is marking it", async () => {
    api.evaluate
      .mockResolvedValueOnce({ sample_id: "gvm_1", state: "processing" })
      .mockResolvedValueOnce(TURN);
    await expect(send()).resolves.toMatchObject({ kind: "marked" });
    expect(api.evaluate).toHaveBeenCalledTimes(2);
  });

  it("uploads again when the audio never landed", async () => {
    api.evaluate
      .mockRejectedValueOnce(
        new VoiceError("not ready", 409, "audio_not_ready"),
      )
      .mockResolvedValueOnce(TURN);
    await expect(send()).resolves.toMatchObject({ kind: "marked" });
    expect(api.uploadAudio).toHaveBeenCalledTimes(2);
  });

  it("hands the answer back when its audio still has not landed", async () => {
    const notReady = new VoiceError("not ready", 409, "audio_not_ready");
    api.evaluate
      .mockRejectedValueOnce(notReady)
      .mockRejectedValueOnce(notReady);
    await expect(send()).resolves.toEqual({
      kind: "refused",
      code: "audio_not_ready",
      status: 409,
    });
    expect(api.uploadAudio).toHaveBeenCalledTimes(2);
  });

  it.each([
    [422, "no_speech"],
    [409, "step_not_offered"],
    [409, "unsupported_prompt"],
    [409, "idempotency_conflict"],
    [404, null],
  ] as const)(
    "hands back a %i %s and keeps only the refusal",
    async (status, code) => {
      api.evaluate.mockRejectedValueOnce(new VoiceError("no", status, code));
      const refused = { kind: "refused", code, status };
      await expect(send()).resolves.toEqual(refused);
      expect(kept.size).toBe(0);
      expect(settled.get("key-1")).toEqual(refused);
    },
  );

  it.each([
    [503, null],
    [429, "rate_limited"],
    [502, "provider_failure"],
    [503, "voice_unavailable"],
    [520, null],
    [505, null],
    [401, null],
    [403, null],
    [409, "learner_required"],
  ] as const)(
    "keeps the answer through a %i %s, which may pass on a later try",
    async (status, code) => {
      api.evaluate.mockRejectedValueOnce(
        new VoiceError("later", status, code as VoiceCode | null),
      );
      await expect(send()).resolves.toEqual({ kind: "kept", status, code });
      expect(kept.has("key-1")).toBe(true);
      expect(settled.size).toBe(0);
    },
  );
});
