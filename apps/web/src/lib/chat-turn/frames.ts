// A turn's events as the server sends them (apps/server/src/app/turns/frames.py): each carries the
// seq it has in the chat and `prev`, the seq of the frame before it. The page keeps the seq of the last
// frame it applied, so a connection that drops and is opened again from that seq shows each frame once.

export interface TurnReply {
  answer: string;
  data: unknown;
}

interface Placed {
  seq: number;
  prev: number;
}

export type TurnStatus = "ok" | "failed" | "stopped";

export type Frame =
  | (Placed & { kind: "text"; text: string })
  | (Placed & { kind: "round.aborted"; reason: string })
  | (Placed & {
      kind: "tool.started" | "tool" | "tool.cancelled";
      tool: string;
    })
  | (Placed & { kind: "turn.resumed" })
  | (Placed & {
      kind: "turn.finished";
      status: TurnStatus;
      cause?: string;
      reply?: TurnReply;
    })
  | { kind: "reset" };

export type Finished = Extract<Frame, { kind: "turn.finished" }>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStatus = (value: unknown): value is TurnStatus =>
  value === "ok" || value === "failed" || value === "stopped";

function replyOf(value: unknown): TurnReply | undefined {
  return isObject(value) && typeof value.answer === "string"
    ? { answer: value.answer, data: value.data }
    : undefined;
}

/** A frame, or null for anything the server would not send: every field is read from the network. */
export function parseFrame(raw: unknown): Frame | null {
  if (!isObject(raw)) return null;
  if (raw.kind === "reset") return { kind: "reset" };
  const { seq, prev, kind } = raw;
  if (!Number.isInteger(seq) || !Number.isInteger(prev)) return null;
  const placed = { seq: seq as number, prev: prev as number };
  switch (kind) {
    case "text":
      return typeof raw.text === "string"
        ? { ...placed, kind, text: raw.text }
        : null;
    case "round.aborted":
      return { ...placed, kind, reason: String(raw.reason ?? "") };
    case "tool.started":
    case "tool":
    case "tool.cancelled":
      return typeof raw.tool === "string"
        ? { ...placed, kind, tool: raw.tool }
        : null;
    case "turn.resumed":
      return { ...placed, kind };
    case "turn.finished":
      return isStatus(raw.status)
        ? {
            ...placed,
            kind,
            status: raw.status,
            cause: typeof raw.cause === "string" ? raw.cause : undefined,
            reply: replyOf(raw.reply),
          }
        : null;
    default:
      return null;
  }
}

export type Taken = "apply" | "skip" | "gap" | "reset";

/** What a page has had of a turn: the seq of the last frame it applied. */
export class Cursor {
  at: number;

  constructor(at: number) {
    this.at = at;
  }

  /** What to do with a frame. A frame at or below the cursor was had; one whose `prev` is not the
   * cursor means a frame was lost, so the connection is opened again from the cursor. */
  take(frame: Frame): Taken {
    if (frame.kind === "reset") return "reset";
    if (frame.seq <= this.at) return "skip";
    if (frame.prev !== this.at) return "gap";
    this.at = frame.seq;
    return "apply";
  }
}
