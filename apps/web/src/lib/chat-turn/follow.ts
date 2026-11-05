import { ApiError, UNREADABLE_ANSWER } from "@/lib/api/errors";
import { Cursor, type Finished, type Frame } from "./frames";
import { LinkFailed, type Link, type LinkKind } from "./links";

/** The chat the page was following is gone from the server, so there is nothing to ask from. */
export class ChatGone extends Error {
  constructor() {
    super("The chat is gone");
    this.name = "ChatGone";
  }
}

/** The page stopped following. */
export class Left extends Error {
  constructor() {
    super("The page stopped following the turn");
    this.name = "Left";
  }
}

export interface FrameListener {
  onText: (text: string) => void;
  /** What streamed is withdrawn: the tutor is writing the answer again. */
  onRestart: () => void;
  onActivity: (tool: string | null) => void;
  onReconnecting: (reconnecting: boolean) => void;
}

export interface Follow {
  /** The seq the turn's frames come after. */
  cursor: number;
  link: (kind: LinkKind, fresh: boolean) => Link;
  listener: FrameListener;
  /** Aborted when the page stops following. */
  signal: AbortSignal;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  showReconnectingAfterMs?: number;
}

// A socket that fails to open this many times in a row gives way to server-sent events.
const SOCKET_TRIES = 2;
const FIRST_DELAY_MS = 250;
const LONGEST_DELAY_MS = 5_000;
// Server-sent events end every 20 s; asking again at once is not a failure.
const READ_AGAIN_MS = 250;
// A turn is given up on by the server ten minutes after it began.
const LONGEST_TURN_MS = 11 * 60 * 1000;
const SHOW_AFTER_MS = 1_200;

/** Waits, and ends early when the browser comes back online or the page leaves. */
export function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("online", done);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    window.addEventListener("online", done);
    signal.addEventListener("abort", done);
  });
}

/** Doubling from a quarter second to five, spread so pages that lost the network together do not
 * return together. */
export function backoff(attempt: number, random = Math.random): number {
  const wait = Math.min(FIRST_DELAY_MS * 2 ** (attempt - 1), LONGEST_DELAY_MS);
  return Math.round(wait * (0.75 + random() * 0.5));
}

/** Tells the page it is reconnecting only when the connection stays down, not at a blink. */
class Presence {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private shown = false;

  private readonly listener: FrameListener;
  private readonly afterMs: number;

  constructor(listener: FrameListener, afterMs: number) {
    this.listener = listener;
    this.afterMs = afterMs;
  }

  down(): void {
    if (this.timer !== undefined || this.shown) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.shown = true;
      this.listener.onReconnecting(true);
    }, this.afterMs);
  }

  up(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.shown) return;
    this.shown = false;
    this.listener.onReconnecting(false);
  }
}

/** True for the frame that ends the turn. */
function deliver(frame: Frame, listener: FrameListener): boolean {
  switch (frame.kind) {
    case "text":
      listener.onText(frame.text);
      return false;
    case "round.aborted":
      listener.onRestart();
      return false;
    case "tool.started":
      listener.onActivity(frame.tool);
      return false;
    case "tool.cancelled":
      listener.onActivity(null);
      return false;
    case "turn.finished":
      return true;
    default:
      return false;
  }
}

/** Reads a turn to its end across connections that drop. Each connection starts from the seq of the
 * last frame applied, so a frame is applied once however many connections it took: a socket first,
 * server-sent events after the socket twice fails to open. */
export async function followTurn(follow: Follow): Promise<Finished> {
  const { signal, listener, now = Date.now, sleep = pause } = follow;
  const cursor = new Cursor(follow.cursor);
  const presence = new Presence(
    listener,
    follow.showReconnectingAfterMs ?? SHOW_AFTER_MS,
  );
  const deadline = now() + LONGEST_TURN_MS;
  let failedOpens = 0;
  let attempt = 0;
  try {
    for (;;) {
      if (signal.aborted) throw new Left();
      if (now() > deadline) {
        throw new ApiError(
          "The tutor stopped before answering",
          UNREADABLE_ANSWER,
        );
      }
      const kind: LinkKind = failedOpens >= SOCKET_TRIES ? "events" : "socket";
      const link = follow.link(kind, kind === "socket" && failedOpens > 0);
      let applied = false;
      try {
        const opened = () => {
          failedOpens = 0;
          presence.up();
        };
        for await (const frame of link.frames(cursor.at, signal, opened)) {
          const taken = cursor.take(frame);
          if (taken === "skip") continue;
          if (taken === "reset") throw new ChatGone();
          if (taken === "gap") throw new LinkFailed("A frame was lost", true);
          applied = true;
          attempt = 0;
          presence.up();
          if (deliver(frame, listener)) return frame as Finished;
        }
        if (signal.aborted) throw new Left();
        if (!applied) await sleep(READ_AGAIN_MS, signal);
      } catch (error) {
        if (!(error instanceof LinkFailed)) throw error;
        if (signal.aborted) throw new Left();
        failedOpens = error.opened ? 0 : failedOpens + 1;
        attempt += 1;
        presence.down();
        await sleep(backoff(attempt), signal);
      }
    }
  } finally {
    presence.up();
  }
}
