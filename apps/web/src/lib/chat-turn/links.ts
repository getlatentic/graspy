import { API_BASE_URL } from "@/lib/env";
import { toApiError } from "@/lib/api/errors";
import {
  fetchWithSession,
  getSessionToken,
  refreshSessionToken,
} from "@/lib/api/session";
import { parseFrame, type Frame } from "./frames";
import { Queue } from "./queue";
import { chatUrl } from "./rest";

/** The connection to a turn failed. `opened` says whether it had opened: a socket that never opens
 * is a place the page cannot reach, which server-sent events may. */
export class LinkFailed extends Error {
  readonly opened: boolean;

  constructor(message: string, opened: boolean) {
    super(message);
    this.name = "LinkFailed";
    this.opened = opened;
  }
}

/** One connection to a turn, from a cursor. It ends when the turn's frames are all read or the
 * connection is over, and throws LinkFailed when the connection broke. */
export interface Link {
  /** `opened` is called once the connection is open, before the first frame. */
  frames(
    after: number,
    signal: AbortSignal,
    opened?: () => void,
  ): AsyncGenerator<Frame>;
}

export type LinkKind = "socket" | "events";

export interface LinkOptions {
  /** The session token to offer; `fresh` asks for a new one, as a socket that never opened may have
   * been refused for an old one. */
  token?: (fresh: boolean) => Promise<string>;
  open?: (url: string, protocols: string[]) => WebSocket;
  now?: () => number;
}

const PROTOCOL = "graspy.v1";
// The runtime answers the text `ping` with `pong` without waking the chat's object.
const PING_MS = 15_000;
const SILENT_MS = 40_000;
const CONNECT_MS = 10_000;
// The server ends a request after 20 s; a longer silence is a connection that is no longer there.
const STALL_MS = 30_000;

const defaultToken = (fresh: boolean) =>
  fresh ? refreshSessionToken() : getSessionToken();

const defaultOpen = (url: string, protocols: string[]) =>
  new WebSocket(url, protocols);

function socketUrl(chat: string, turn: string, after: number): string {
  const base = API_BASE_URL.replace(/^http/, "ws");
  return `${base}/chats/${encodeURIComponent(chat)}/turns/${encodeURIComponent(turn)}/socket?after=${after}`;
}

function frameOf(data: unknown): Frame | null {
  if (typeof data !== "string") return null;
  try {
    return parseFrame(JSON.parse(data));
  } catch {
    return null;
  }
}

export function socketLink(
  chat: string,
  turn: string,
  {
    token = defaultToken,
    open = defaultOpen,
    now = Date.now,
  }: LinkOptions = {},
  fresh = false,
): Link {
  return {
    async *frames(after, signal, onOpen) {
      const socket = open(socketUrl(chat, turn, after), [
        PROTOCOL,
        await token(fresh),
      ]);
      const queue = new Queue<Frame>();
      const began = now();
      let opened = false;
      let heard = began;
      const fail = (message: string) =>
        queue.end(new LinkFailed(message, opened));

      socket.onopen = () => {
        opened = true;
        heard = now();
        onOpen?.();
      };
      socket.onmessage = (event) => {
        heard = now();
        const frame = frameOf(event.data);
        if (frame) queue.push(frame);
      };
      socket.onerror = () => fail("The socket failed");
      socket.onclose = () => fail("The socket closed");
      const watch = setInterval(() => {
        if (!opened && now() - began > CONNECT_MS)
          fail("The socket did not open");
        else if (opened && now() - heard > SILENT_MS)
          fail("The socket went silent");
        else if (opened) socket.send("ping");
      }, PING_MS);
      const leave = () => queue.end();
      signal.addEventListener("abort", leave);
      try {
        yield* queue.drain();
      } finally {
        clearInterval(watch);
        signal.removeEventListener("abort", leave);
        socket.onopen =
          socket.onmessage =
          socket.onerror =
          socket.onclose =
            null;
        socket.close();
      }
    },
  };
}

function* dataOf(block: string): Generator<string> {
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("data:")) yield line.slice(5).trimStart();
  }
}

async function readWithin(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  ms: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new LinkFailed("The stream stalled", true)),
      ms,
    );
  });
  try {
    return await Promise.race([reader.read(), stalled]);
  } finally {
    clearTimeout(timer);
  }
}

/** Server-sent events with `Last-Event-ID`, read from a fetch because the session is a header. */
export function eventsLink(chat: string, turn: string): Link {
  return {
    async *frames(after, signal, onOpen) {
      let response: Response;
      try {
        response = await fetchWithSession(
          `${chatUrl(chat)}/turns/${encodeURIComponent(turn)}/events`,
          {
            headers: {
              Accept: "text/event-stream",
              "Last-Event-ID": String(after),
            },
            signal,
          },
        );
      } catch (cause) {
        if (signal.aborted) return;
        throw new LinkFailed(String(cause), false);
      }
      if (!response.ok) {
        const failure = await toApiError(response);
        if (failure.retryable) throw new LinkFailed(failure.message, false);
        throw failure;
      }
      if (!response.body) throw new LinkFailed("The stream has no body", false);
      onOpen?.();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          let read: ReadableStreamReadResult<Uint8Array>;
          try {
            read = await readWithin(reader, STALL_MS);
          } catch (cause) {
            if (signal.aborted) return;
            throw cause instanceof LinkFailed
              ? cause
              : new LinkFailed(String(cause), true);
          }
          if (read.done) return;
          buffer += decoder.decode(read.value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            for (const data of dataOf(block)) {
              const frame = frameOf(data);
              if (frame) yield frame;
            }
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
    },
  };
}
