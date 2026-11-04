import {
  askAgent,
  TurnStopped,
  type TurnListener,
  type TutorReply,
  type TutorTurn,
} from "@/lib/a2a/client";
import { replyDataOf } from "@/lib/a2a/reply-data";
import { plainParts } from "@/lib/a2a/request-data";
import { ApiError, UNREADABLE_ANSWER } from "@/lib/api/errors";
import type { Finished } from "./frames";
import { ChatGone, followTurn, Left } from "./follow";
import { eventsLink, socketLink, type LinkKind } from "./links";
import { startTurn, stopTurn, TurnsUnavailable } from "./rest";

// After the learner stops, the page waits this long for the turn's end before it shows what it has.
const STOP_WAIT_MS = 6_000;

/** `keepsTurns` goes false when the server answers that it keeps none: the tutor is then asked over
 * A2A, as before. */
export const server = { keepsTurns: true };

function replyOf(chat: string, finished: Finished): TutorReply {
  const answer = finished.reply?.answer ?? "";
  return {
    text: answer.trim(),
    contextId: chat,
    ...replyDataOf(finished.reply?.data),
    ...(finished.status === "stopped" ? { stopped: true } : {}),
  };
}

function failureOf(finished: Finished): ApiError {
  return new ApiError(
    `The tutor could not answer (${finished.cause ?? "failed"})`,
    UNREADABLE_ANSWER,
  );
}

/** Asks the tutor to start the turn, then follows it. The turn runs on the server whatever happens to
 * this page's connection, which is opened again from the last frame the page applied. The learner's
 * stop is sent to the server and the turn ends with the words it has written. */
export async function askTurn(
  turn: TutorTurn,
  listener: TurnListener = {},
): Promise<TutorReply> {
  if (!server.keepsTurns) return askAgent(turn, listener);
  const chat = turn.contextId ?? crypto.randomUUID();
  const id = crypto.randomUUID();
  let cursor: number;
  try {
    ({ cursor } = await startTurn(chat, id, {
      parts: plainParts(turn.text, {
        calls: turn.appCalls,
        unanswered: turn.unanswered,
      }),
      metadata: turn.learner ? { learner: turn.learner } : {},
    }));
  } catch (error) {
    if (!(error instanceof TurnsUnavailable)) throw error;
    server.keepsTurns = false;
    return askAgent(turn, listener);
  }

  const leave = new AbortController();
  let stopped = false;
  const stop = () => {
    stopped = true;
    void stopTurn(chat, id).catch(() => leave.abort());
    setTimeout(() => leave.abort(), STOP_WAIT_MS);
  };
  listener.signal?.addEventListener("abort", stop, { once: true });
  try {
    const finished = await followTurn({
      cursor,
      signal: leave.signal,
      link: (kind: LinkKind, fresh: boolean) =>
        kind === "socket"
          ? socketLink(chat, id, {}, fresh)
          : eventsLink(chat, id),
      listener: {
        onText: (text) => listener.onDelta?.(text),
        onRestart: () => listener.onRestart?.(),
        onActivity: (tool) => listener.onActivity?.(tool),
        onReconnecting: (on) => listener.onReconnecting?.(on),
      },
    });
    if (finished.status === "failed") throw failureOf(finished);
    return replyOf(chat, finished);
  } catch (error) {
    if (error instanceof Left && stopped) throw new TurnStopped();
    if (error instanceof ChatGone) {
      throw new ApiError("The chat is gone", UNREADABLE_ANSWER);
    }
    throw error;
  } finally {
    listener.signal?.removeEventListener("abort", stop);
    leave.abort();
  }
}
