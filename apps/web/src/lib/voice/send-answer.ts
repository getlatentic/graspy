import { isRetryableStatus } from "@/lib/api/errors";
import { VoiceError, type VoiceCode } from "./voice-api";
import type { KeptAnswer } from "./answer-store";
import type { CreatedSample, Evaluation, MarkedTurn } from "./voice-types";

export interface AnswerApi {
  createSample(
    key: string,
    metadata: KeptAnswer["metadata"],
  ): Promise<CreatedSample>;
  uploadAudio(uploadPath: string, wav: Blob): Promise<unknown>;
  evaluate(sampleId: string): Promise<Evaluation>;
}

export interface AnswerKeeping {
  keep(answer: KeptAnswer): Promise<void>;
  forget(key: string): Promise<void>;
}

export type Sent =
  | { kind: "marked"; turn: MarkedTurn }
  /** Not reached, or not marked yet: the answer stays on the device and goes again. */
  | { kind: "kept" }
  | { kind: "refused"; code: VoiceCode | null; status: number };

const MARKING_POLLS = 20;
const POLL_MS = 3_000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Whether the answer is worth sending again: the voice API gave no answer (status 0, which
 * covers any failure to get a session), or was busy or failed on its side. */
function transient(error: VoiceError): boolean {
  return error.code === null && isRetryableStatus(error.status);
}

async function uploaded(
  answer: KeptAnswer,
  api: AnswerApi,
  keeping: AnswerKeeping,
): Promise<KeptAnswer> {
  let next = answer;
  if (!next.sampleId) {
    const created = await api.createSample(next.key, next.metadata);
    next = {
      ...next,
      sampleId: created.sample_id,
      uploadPath: created.upload_path,
      uploaded: created.state === "ready",
    };
    await keeping.keep(next);
  }
  if (!next.uploaded) {
    const path = next.uploadPath ?? `/api/voice/samples/${next.sampleId}/audio`;
    await api.uploadAudio(path, next.wav);
    next = { ...next, uploaded: true };
    await keeping.keep(next);
  }
  return next;
}

async function marked(
  sampleId: string,
  api: AnswerApi,
  pause: (ms: number) => Promise<unknown>,
): Promise<MarkedTurn | null> {
  for (let poll = 0; poll < MARKING_POLLS; poll += 1) {
    const evaluation = await api.evaluate(sampleId);
    if (evaluation.state === "complete") return evaluation;
    await pause(POLL_MS);
  }
  return null;
}

/**
 * Creates the recording, uploads its audio and has it marked, keeping each step on the device
 * so a retry resumes where the last one stopped. The answer leaves the device only once the
 * server has marked or refused it.
 */
export async function sendAnswer(
  answer: KeptAnswer,
  api: AnswerApi,
  keeping: AnswerKeeping,
  pause: (ms: number) => Promise<unknown> = wait,
): Promise<Sent> {
  try {
    let sent = await uploaded(answer, api, keeping);
    let turn: MarkedTurn | null;
    try {
      turn = await marked(sent.sampleId!, api, pause);
    } catch (error) {
      if (!(error instanceof VoiceError) || error.code !== "audio_not_ready")
        throw error;
      // The audio never landed: upload it once more, then ask again.
      sent = await uploaded({ ...sent, uploaded: false }, api, keeping);
      turn = await marked(sent.sampleId!, api, pause);
    }
    if (!turn) return { kind: "kept" };
    await keeping.forget(answer.key);
    return { kind: "marked", turn };
  } catch (error) {
    if (!(error instanceof VoiceError) || transient(error)) {
      if (!(error instanceof VoiceError))
        console.warn("Sending an answer failed:", error);
      return { kind: "kept" };
    }
    await keeping.forget(answer.key);
    return { kind: "refused", code: error.code, status: error.status };
  }
}
