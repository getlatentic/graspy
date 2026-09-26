import {
  keepProgress,
  keptAnswer,
  keptAnswers,
  settleAnswer,
  settledOf,
  type Settled,
} from "./answer-store";
import { sendAnswer, type Sent } from "./send-answer";
import { createSample, evaluate, uploadAudio } from "./voice-api";

const api = { createSample, uploadAudio, evaluate };
const keeping = { keep: keepProgress, settle: settleAnswer };

type Listener = (key: string, sent: Settled) => void;
const listeners = new Set<Listener>();

async function sendIfWaiting(key: string): Promise<Sent | null> {
  const answer = await keptAnswer(key);
  if (!answer) return null;
  const sent = await sendAnswer(answer, api, keeping);
  if (sent.kind !== "kept")
    for (const listener of listeners) listener(key, sent);
  return sent;
}

const inFlight = new Map<string, Promise<Sent | null>>();

/**
 * Sends one kept answer, or joins the send already under way; null once it is no longer waiting.
 * Read afresh each time, so an answer settled and shown since is never sent again.
 */
export function sendKept(key: string): Promise<Sent | null> {
  let sending = inFlight.get(key);
  if (!sending) {
    sending = sendIfWaiting(key).finally(() => inFlight.delete(key));
    inFlight.set(key, sending);
  }
  return sending;
}

// An answer the voice API answered but kept holds back none after it; with no answer, none would go.
async function sendAll(learner: string): Promise<void> {
  for (const { key } of await keptAnswers(learner)) {
    const sent = await sendKept(key);
    if (sent?.kind === "kept" && sent.status === 0) return;
  }
}

const sending = new Map<string, Promise<void>>();

/** Sends this learner's kept answers in the order they were said, one run at a time for each learner. */
export function sendKeptAnswers(learner: string): Promise<void> {
  let run = sending.get(learner);
  if (!run) {
    run = sendAll(learner).finally(() => sending.delete(learner));
    sending.set(learner, run);
  }
  return run;
}

/** Sends this learner's kept answers; false while some are still to be sent. An answer marked or
 * refused and waiting to be shown has reached the server. */
export async function sentEveryAnswer(learner: string): Promise<boolean> {
  await sendKeptAnswers(learner);
  return (await keptAnswers(learner)).length === 0;
}

/** The answer's outcome once the server has given one, whoever sent it; never once aborted. */
export function whenSettled(
  key: string,
  signal: AbortSignal,
): Promise<Settled> {
  return new Promise((resolve) => {
    const done = (sent: Settled) => {
      stop();
      if (!signal.aborted) resolve(sent);
    };
    const listener: Listener = (settled, sent) => settled === key && done(sent);
    const stop = () => {
      listeners.delete(listener);
      signal.removeEventListener("abort", stop);
    };
    listeners.add(listener);
    signal.addEventListener("abort", stop);
    // Heard first, then read: an outcome given in between is caught by one or the other.
    void settledOf(key)
      .then((sent) => sent && done(sent))
      .catch(() => undefined);
  });
}
