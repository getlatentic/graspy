import { isRetryableStatus } from "@/lib/api/errors";
import { VoiceError, type VoiceCode } from "./voice-api";
import type { KeptAnswer, Settled } from "./answer-store";
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
  settle(answer: KeptAnswer, sent: Settled): Promise<void>;
}

/**
 * Not marked yet: the answer stays on the device and goes again. `status` is what the voice API
 * answered, 202 while it is still marking; 0 when it gave no answer or the device failed.
 */
export type Kept = { kind: "kept"; status: number; code: VoiceCode | null };

export type Sent = Settled | Kept;

/** Kept with no answer from the voice API. */
export const UNANSWERED: Kept = { kind: "kept", status: 0, code: null };

const MARKING_POLLS = 20;
const POLL_MS = 3_000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Refusals of the session, not of the answer: it goes again once the session is sorted.
const SESSION_STATUSES = new Set([401, 403]);

/** Whether the answer is worth sending again: the voice API gave no answer (status 0, which
 * covers any failure to get a session), was busy or failed on its side (any 5xx), whatever
 * code it named, or refused the session rather than the answer. */
function transient(error: VoiceError): boolean {
  return (
    isRetryableStatus(error.status) ||
    error.status >= 500 ||
    SESSION_STATUSES.has(error.status) ||
    error.code === "learner_required"
  );
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

async function settled(
  answer: KeptAnswer,
  sent: Settled,
  keeping: AnswerKeeping,
): Promise<Sent> {
  await keeping.settle(answer, sent);
  return sent;
}

/**
 * Creates the recording, uploads its audio and has it marked, keeping each step on the device
 * so a retry resumes where the last one stopped. The recording leaves the device only once the
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
    if (!turn) return { kind: "kept", status: 202, code: null };
    return settled(answer, { kind: "marked", turn }, keeping);
  } catch (error) {
    if (!(error instanceof VoiceError)) {
      console.warn("Sending an answer failed:", error);
      return UNANSWERED;
    }
    if (transient(error))
      return { kind: "kept", status: error.status, code: error.code };
    const refused: Settled = {
      kind: "refused",
      code: error.code,
      status: error.status,
    };
    return settled(answer, refused, keeping);
  }
}
