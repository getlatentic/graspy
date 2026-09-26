import { fetchWithSession } from "@/lib/api/session";
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

  /** The server was never reached: the request can be made again unchanged. */
  get unreachable(): boolean {
    return this.status === 0;
  }
}

type Body = { detail?: unknown; code?: unknown; error?: unknown };

// A voice refusal is {"detail", "code"}; one raised before the route, {"detail": {"error", "code"}}.
async function refusalOf(response: Response): Promise<VoiceError> {
  const body = (await response.json().catch(() => ({}))) as Body;
  const inner = (typeof body.detail === "object" ? body.detail : {}) as Body;
  const code = (body.code ?? inner.code ?? null) as VoiceCode | null;
  const message = String(
    (typeof body.detail === "string" ? body.detail : inner.error) ??
      `Voice request failed with status ${response.status}`,
  );
  return new VoiceError(message, response.status, code);
}

async function send(url: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetchWithSession(url, init);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Network failed";
    throw new VoiceError(message, 0, null);
  }
  if (!response.ok) throw await refusalOf(response);
  return response;
}

const json = async <T>(url: string, init?: RequestInit): Promise<T> =>
  (await send(url, init)).json() as Promise<T>;

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

export async function teacherAudio(
  utterance: string,
  language: LessonLanguage,
): Promise<Blob> {
  const url = `${VOICE}/teacher-audio/${encodeURIComponent(utterance)}?${query({ language })}`;
  return (await send(url)).blob();
}

export function createSample(
  idempotencyKey: string,
  metadata: SampleMetadata,
): Promise<CreatedSample> {
  return json(
    `${VOICE}/samples`,
    post(metadata, { "Idempotency-Key": idempotencyKey }),
  );
}

/** `uploadPath` is the path the server named for this sample's audio. */
export function uploadAudio(uploadPath: string, wav: Blob): Promise<unknown> {
  const url = new URL(uploadPath, API_BASE_URL).toString();
  return json(url, {
    method: "PUT",
    headers: { "Content-Type": "audio/wav" },
    body: wav,
  });
}

export function evaluate(sampleId: string): Promise<Evaluation> {
  return json(`${VOICE}/samples/${sampleId}/evaluation`, { method: "POST" });
}

export async function replyAudio(sampleId: string): Promise<Blob> {
  return (await send(`${VOICE}/samples/${sampleId}/reply-audio`)).blob();
}
