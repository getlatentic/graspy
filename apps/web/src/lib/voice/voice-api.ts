import { audioFormat } from "./audio-format";
import { fetchWithSession } from "@/lib/api/session";
import { voiceLearnerKey } from "./voice-learner-key";
import { API_BASE_URL } from "@/lib/env";
import type {
  Catalogue,
  CreatedSample,
  Evaluation,
  LessonLanguage,
  LessonSnapshot,
  SampleMetadata,
} from "./voice-types";

const VOICE = `${API_BASE_URL}/voice`;

/** What the server named a refusal; several share a status, so only the code decides. */
export type VoiceCode =
  | "step_not_offered"
  | "audio_not_ready"
  | "unsupported_prompt"
  | "idempotency_conflict"
  | "no_speech"
  | "provider_failure"
  | "marking_failed"
  | "learner_required"
  | "voice_unavailable";

export class VoiceError extends Error {
  readonly status: number;
  readonly code: VoiceCode | null;

  constructor(message: string, status: number, code: VoiceCode | null) {
    super(message);
    this.name = "VoiceError";
    this.status = status;
    this.code = code;
  }
}

type Body = { detail?: unknown; code?: unknown; error?: unknown };

// The body a route of graspy's own refuses with; FastAPI answers a path it has no route for, such
// as one mid-deploy, with {"detail": "Not Found"}.
const graspys = (body: Body | null, status: number): body is Body =>
  typeof body === "object" &&
  body !== null &&
  ("detail" in body || "code" in body) &&
  !(status === 404 && body.detail === "Not Found");

// A voice refusal is {"detail", "code"}; one raised before the route, {"detail": {"error", "code"}}.
// A 4xx without graspy's body came from something in the way, so the voice API gave no answer.
async function refusalOf(response: Response): Promise<VoiceError> {
  const found = (await response.json().catch(() => null)) as Body | null;
  if (response.status < 500 && !graspys(found, response.status))
    return new VoiceError(`Voice request answered ${response.status}`, 0, null);
  const body = found ?? {};
  const inner = (typeof body.detail === "object" ? body.detail : {}) as Body;
  const code = (body.code ?? inner.code ?? null) as VoiceCode | null;
  const message = String(
    (typeof body.detail === "string" ? body.detail : inner.error) ??
      `Voice request failed with status ${response.status}`,
  );
  return new VoiceError(message, response.status, code);
}

// Past these a request is given up and counts as the network failing, so a retry sends it again.
const REQUEST_MS = 30_000;
// Marking holds the request: transcription alone may take about 95 s, and the tutor's marking 30 s.
// A marking given up here is kept and asked for again.
const MARKING_MS = 150_000;
// A long answer on a slow connection: 8 KB a second, the slowest upload waited for.
const uploadMs = (wav: Blob) => REQUEST_MS + Math.ceil(wav.size / 8);

// Also covers the wait for a session token, which fetch's signal does not reach.
const givenUp = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => {
    const fail = () => reject(signal.reason);
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail, { once: true });
  });

// Made for this learner only: once the device learns as someone else, nothing more is sent.
const whileLearning = (learner?: string) =>
  learner === undefined ? undefined : () => voiceLearnerKey() === learner;

async function send<T>(
  url: string,
  read: (response: Response) => Promise<T>,
  init: RequestInit = {},
  ms = REQUEST_MS,
  learner?: string,
): Promise<T> {
  const signal = AbortSignal.timeout(ms);
  const answered = async () => {
    const response = await fetchWithSession(
      url,
      { ...init, signal },
      whileLearning(learner),
    );
    if (!response.ok) throw await refusalOf(response);
    return read(response);
  };
  try {
    return await Promise.race([answered(), givenUp(signal)]);
  } catch (cause) {
    if (cause instanceof VoiceError) throw cause;
    // Status 0: the voice API never answered, whether the request or its session failed.
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new VoiceError(message, 0, null);
  }
}

const json = <T>(
  url: string,
  init?: RequestInit,
  ms?: number,
  learner?: string,
): Promise<T> =>
  send(url, (response) => response.json() as Promise<T>, init, ms, learner);

const blob = (url: string) => send(url, (response) => response.blob());

const post = (body: unknown, headers: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});

function query(values: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) {
    if (value) params.set(name, value);
  }
  return params.toString();
}

export function lessonMove(
  learnerClass: string,
  language: LessonLanguage,
  plan?: string,
): Promise<LessonSnapshot> {
  const asked = query({ learner_class: learnerClass, language, plan });
  return json(`${VOICE}/lesson?${asked}`);
}

export function catalogue(
  learnerClass: string,
  language: LessonLanguage,
): Promise<Catalogue> {
  return json(
    `${VOICE}/catalogue?${query({ learner_class: learnerClass, language })}`,
  );
}

/** A line the teacher said that asked nothing back was heard. */
export function lessonEventHeard(event: {
  plan_id: string;
  event_id: string;
  learner_class: string;
}): Promise<unknown> {
  return json(`${VOICE}/lesson/events`, post(event));
}

export function teacherAudio(
  utterance: string,
  language: LessonLanguage,
): Promise<Blob> {
  const url = `${VOICE}/teacher-audio/${encodeURIComponent(utterance)}?${query({ language, format: audioFormat() })}`;
  return blob(url);
}

// `learner`, when given, is whose answer this is: it is sent only while the device learns as them.

export function createSample(
  idempotencyKey: string,
  metadata: SampleMetadata,
  learner?: string,
): Promise<CreatedSample> {
  return json(
    `${VOICE}/samples`,
    post(metadata, { "Idempotency-Key": idempotencyKey }),
    undefined,
    learner,
  );
}

/** `uploadPath` is the path the server named for this sample's audio. */
export function uploadAudio(
  uploadPath: string,
  wav: Blob,
  learner?: string,
): Promise<unknown> {
  const url = new URL(uploadPath, API_BASE_URL).toString();
  return json(
    url,
    { method: "PUT", headers: { "Content-Type": "audio/wav" }, body: wav },
    uploadMs(wav),
    learner,
  );
}

export function evaluate(
  sampleId: string,
  learner?: string,
): Promise<Evaluation> {
  return json(
    `${VOICE}/samples/${sampleId}/evaluation`,
    { method: "POST" },
    MARKING_MS,
    learner,
  );
}

export function replyAudio(sampleId: string): Promise<Blob> {
  const url = `${VOICE}/samples/${sampleId}/reply-audio?${query({ format: audioFormat() })}`;
  return blob(url);
}
