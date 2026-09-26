// For tests: the Worker's voice routes as the web app meets them, and answers kept to them.
import type { KeptAnswer } from "./answer-store";
import type { LessonMove, MarkedTurn } from "./voice-types";

export const ASKED: LessonMove = {
  kind: "event",
  plan_id: "plan.mul.table-7",
  event_id: "e2",
  event: "elicit_performance",
  subject: "mathematics",
  say: "plan.mul.table-7.e2",
  say_text: { en: "What is seven times eight?" },
  activity: { kind: "existing", prompt_id: "mul_fact_7x8_answer" },
};
export const NEXT: LessonMove = {
  ...ASKED,
  event_id: "e3",
  say: "plan.mul.table-7.e3",
  say_text: { en: "What is seven times nine?" },
  activity: { kind: "existing", prompt_id: "mul_fact_7x9_answer" },
};
export const OTHER: LessonMove = {
  ...ASKED,
  plan_id: "plan.mul.table-8",
  say: "plan.mul.table-8.e2",
};

export const turnOf = (sample: string): MarkedTurn => ({
  sample_id: sample,
  state: "complete",
  transcript: "fifty six",
  decision: "correct",
  feedback: "Well done.",
  provider: "intron_sync",
  latency_ms: 900,
});

export const LEARNER = {
  key: "device/abc",
  learnerClass: "primary_4",
  language: "en" as const,
};

export const answerTo = (
  move: LessonMove,
  key: string,
  keptAt: number,
): KeptAnswer => ({
  key,
  learner: LEARNER.key,
  move,
  metadata: {
    speaker_id: "abc",
    language_pair: "pcm-en",
    spoken_language: "en",
    lesson_language: "en",
    learner_class: "primary_4",
    task: "reasoning",
    topic: "multiplication",
    prompt_id: move.activity!.prompt_id,
    plan_id: move.plan_id,
    event_id: move.event_id,
    device: "web",
    consent: { granted: true, scope: "voice_lesson" },
  },
  wav: new Blob(["RIFF"], { type: "audio/wav" }),
  keptAt,
});

/** The answer the page kept to ASKED before it was reloaded. */
export const KEPT = answerTo(ASKED, "key-1", 1);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// A step moves on only once the answer to it is marked.
export const server = {
  reachable: true,
  marked: new Set<string>(),
  refusal: null as null | { status: number; code: string },
  /** How many more markings it answers 503, too busy. */
  busy: 0,
  /** Samples whose marking waits until released. */
  held: new Map<string, Promise<void>>(),
  /** How many more markings never answer: only the request's signal ends them, as it ends fetch. */
  hung: 0,
  asked: [] as string[],
};

export function resetServer(): void {
  Object.assign(server, {
    reachable: true,
    marked: new Set(),
    refusal: null,
    busy: 0,
    held: new Map(),
    hung: 0,
    asked: [],
  });
}

const sampleOf = (url: string) => url.match(/samples\/(gvm_[^/]+)\//)![1];

function step(url: string): Response {
  const chosen = new URL(url).searchParams.get("plan");
  const move =
    chosen === OTHER.plan_id
      ? OTHER
      : server.marked.has("gvm_key-1")
        ? NEXT
        : ASKED;
  return json({ move, revision: 0, day: "d" });
}

function created(init: RequestInit | undefined): Response {
  const key = new Headers(init?.headers).get("Idempotency-Key");
  return json({
    sample_id: `gvm_${key}`,
    state: "awaiting_audio",
    upload_path: `/api/voice/samples/gvm_${key}/audio`,
  });
}

const never = (signal: AbortSignal | null | undefined) =>
  new Promise<never>((_, reject) =>
    signal?.addEventListener("abort", () => reject(signal.reason)),
  );

async function marking(
  sample: string,
  init: RequestInit | undefined,
): Promise<Response> {
  if (server.hung > 0) {
    server.hung -= 1;
    return never(init?.signal);
  }
  await server.held.get(sample);
  if (server.busy > 0) {
    server.busy -= 1;
    return json({ detail: "busy" }, 503);
  }
  const { refusal } = server;
  if (refusal) return json({ detail: "refused", ...refusal }, refusal.status);
  server.marked.add(sample);
  return json(turnOf(sample));
}

/** Stands in for fetchWithSession. */
export async function respond(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  if (!server.reachable) throw new TypeError("Failed to fetch");
  const method = init?.method ?? "GET";
  server.asked.push(`${method} ${new URL(url).pathname}`);
  if (url.includes("/voice/lesson")) return step(url);
  if (method === "POST" && url.endsWith("/voice/samples")) return created(init);
  if (method === "PUT")
    return json({ sample_id: sampleOf(url), state: "ready" });
  return marking(sampleOf(url), init);
}

export function holdMarking(sample = "gvm_key-1"): () => void {
  let release = () => {};
  server.held.set(
    sample,
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  return () => release();
}

export const sent = (what: string) =>
  server.asked.filter((asked) => asked === what);
