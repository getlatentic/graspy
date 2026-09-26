import {
  forgetAnswer,
  keepAnswer,
  keptAnswers,
  type KeptAnswer,
} from "./answer-store";
import { sendAnswer, type Sent } from "./send-answer";
import { createSample, evaluate, uploadAudio } from "./voice-api";

const api = { createSample, uploadAudio, evaluate };
const keeping = { keep: keepAnswer, forget: forgetAnswer };

type Listener = (key: string, sent: Sent) => void;
const listeners = new Set<Listener>();

/** Hears each kept answer the server marks or refuses, whoever sent it. */
export function onAnswerSettled(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function settled(key: string, sent: Sent): Sent {
  if (sent.kind !== "kept")
    for (const listener of listeners) listener(key, sent);
  return sent;
}

/** Keeps the answer on the device first, so nothing the child said is lost to the network. */
export async function keepAndSend(answer: KeptAnswer): Promise<Sent> {
  await keepAnswer(answer);
  return settled(answer.key, await sendAnswer(answer, api, keeping));
}

let sending: Promise<void> | null = null;

async function sendAll(learner: string): Promise<void> {
  for (const answer of await keptAnswers(learner)) {
    const sent = settled(answer.key, await sendAnswer(answer, api, keeping));
    if (sent.kind === "kept") return;
  }
}

/** Sends this learner's kept answers in the order they were said, one run at a time. */
export function sendKeptAnswers(learner: string): Promise<void> {
  sending ??= sendAll(learner).finally(() => {
    sending = null;
  });
  return sending;
}
