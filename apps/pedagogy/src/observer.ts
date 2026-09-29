import type { Page } from "playwright-core";
import type { Decision, Marking, TeacherMove } from "./turn-log.ts";

interface WireMove {
  kind: "event" | "rest";
  plan_id?: string;
  event_id?: string;
  event?: string;
  say: string;
  say_text?: Record<string, string>;
  show?: Record<string, string> | null;
  activity?: { prompt_id?: string } | null;
  reason?: string;
}

interface WireMarked {
  transcript: string;
  parsed_answer?: number | null;
  decision: Decision;
  feedback: string;
  provider: string;
  latency_ms: number;
}

export function toMove(wire: WireMove, language: string): TeacherMove {
  const pick = (text?: Record<string, string> | null) => text?.[language] ?? text?.en ?? null;
  return {
    kind: wire.kind,
    planId: wire.plan_id ?? null,
    eventId: wire.event_id ?? null,
    promptId: wire.activity?.prompt_id ?? null,
    event: wire.event ?? null,
    says: pick(wire.say_text) ?? wire.say,
    shows: pick(wire.show),
    asksForAnswer: Boolean(wire.activity),
    reason: wire.reason ?? null,
  };
}

export function toMarking(wire: WireMarked): Marking {
  return {
    heard: wire.transcript,
    parsedAnswer: wire.parsed_answer ?? null,
    decision: wire.decision,
    feedback: wire.feedback,
    provider: wire.provider,
    latencyMs: wire.latency_ms,
  };
}

/** Reads what the server tells the app during the lesson, from the wire and not from the page. */
export class LessonObserver {
  readonly moves: TeacherMove[] = [];
  readonly markings: Marking[] = [];
  private readonly language: string;
  /** Asking again for the step already on offer is not a new step. */
  private lastOffered: string | null = null;

  constructor(page: Page, language: string) {
    this.language = language;
    page.on("response", (response) => void this.read(response.url(), response.request().method(), () => response.json()));
  }

  private async read(url: string, method: string, body: () => Promise<unknown>): Promise<void> {
    const { pathname } = new URL(url);
    try {
      if (method === "GET" && pathname.endsWith("/api/voice/lesson")) {
        const { move, revision } = (await body()) as { move: WireMove; revision: number };
        const offered = `${revision}|${move.plan_id}|${move.event_id}`;
        if (offered === this.lastOffered) return;
        this.lastOffered = offered;
        this.moves.push(toMove(move, this.language));
      } else if (method === "POST" && /\/samples\/[^/]+\/evaluation$/.test(pathname)) {
        const marked = (await body()) as WireMarked & { state: string };
        if (marked.state === "complete") this.markings.push(toMarking(marked));
      }
    } catch {
      // A response the page navigated away from has no body to read.
    }
  }
}
