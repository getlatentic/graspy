import { committed, openDB, promisify, VOICE_ANSWER_STORE } from "@/lib/idb";
import type { VoiceCode } from "./voice-api";
import type { LessonMove, MarkedTurn, SampleMetadata } from "./voice-types";

/** What the server made of an answer: marked, or refused with what it named. */
export type Settled =
  | { kind: "marked"; turn: MarkedTurn }
  | { kind: "refused"; code: VoiceCode | null; status: number };

/** A spoken answer on the device, from the moment it is recorded until the server has marked or refused it. */
export interface KeptAnswer {
  /** Its Idempotency-Key: sent again, it names the same recording. */
  key: string;
  learner: string;
  /** The step it answers, so a reloaded lesson shows it again; one kept without it is only sent. */
  move?: LessonMove;
  metadata: SampleMetadata;
  wav: Blob;
  keptAt: number;
  sampleId?: string;
  uploadPath?: string | null;
  uploaded?: boolean;
}

/** A marked or refused answer, kept until the lesson has shown it. */
export interface SettledAnswer {
  key: string;
  /**
   * The learner, not under `learner`: a tab still running an app that predates outcomes sends
   * every record with a `learner` as an answer, and would have this one refused and deleted.
   */
  shownTo: string;
  move: LessonMove;
  keptAt: number;
  sent: Settled;
}

type StoredAnswer = KeptAnswer | SettledAnswer;

const isSettled = (answer: StoredAnswer): answer is SettledAnswer =>
  "sent" in answer;

const learnerOf = (answer: StoredAnswer) =>
  isSettled(answer) ? answer.shownTo : answer.learner;

async function store(mode: IDBTransactionMode) {
  const db = await openDB();
  const tx = db.transaction(VOICE_ANSWER_STORE, mode);
  return { tx, answers: tx.objectStore(VOICE_ANSWER_STORE) };
}

export async function keepAnswer(answer: KeptAnswer): Promise<void> {
  const { tx, answers } = await store("readwrite");
  const done = committed(tx);
  answers.put(answer);
  await done;
}

export async function forgetAnswer(key: string): Promise<void> {
  const { tx, answers } = await store("readwrite");
  const done = committed(tx);
  answers.delete(key);
  await done;
}

/**
 * Writes to an answer only while it is still waiting to be sent, read and written in one
 * transaction: another tab sending the same answer may have settled it, or shown and let it go.
 */
async function whileWaiting(
  key: string,
  write: (answers: IDBObjectStore) => void,
): Promise<void> {
  const { tx, answers } = await store("readwrite");
  const done = committed(tx);
  const found = answers.get(key);
  found.onsuccess = () => {
    const stored = found.result as StoredAnswer | undefined;
    if (stored && !isSettled(stored)) write(answers);
  };
  await done;
}

/** How far sending has got, so a retry resumes there. */
export const keepProgress = (answer: KeptAnswer): Promise<void> =>
  whileWaiting(answer.key, (answers) => answers.put(answer));

/** The recording goes; what the lesson needs to show the outcome stays. */
export function settleAnswer(answer: KeptAnswer, sent: Settled): Promise<void> {
  const { key, learner, move, keptAt } = answer;
  return whileWaiting(key, (answers) =>
    move
      ? answers.put({ key, shownTo: learner, move, keptAt, sent })
      : answers.delete(key),
  );
}

async function learnersAnswers(learner: string): Promise<StoredAnswer[]> {
  const { answers } = await store("readonly");
  const all = await promisify<StoredAnswer[]>(answers.getAll());
  return all
    .filter((answer) => learnerOf(answer) === learner)
    .sort((a, b) => a.keptAt - b.keptAt);
}

/** This learner's answers still to be sent, in the order they were said. */
export async function keptAnswers(learner: string): Promise<KeptAnswer[]> {
  const all = await learnersAnswers(learner);
  return all.filter((answer): answer is KeptAnswer => !isSettled(answer));
}

/**
 * The oldest answer the child has not seen the outcome of, sent or not: to this plan, or with no
 * plan chosen, to any, so none waits unseen for a lesson the child may not open again.
 */
export async function unseenAnswer(
  learner: string,
  plan: string | undefined,
): Promise<{ key: string; move: LessonMove } | null> {
  const all = await learnersAnswers(learner);
  const found = all.find(
    (answer) => answer.move && (!plan || answer.move.plan_id === plan),
  );
  return found?.move ? { key: found.key, move: found.move } : null;
}

async function storedAnswer(key: string): Promise<StoredAnswer | null> {
  const { answers } = await store("readonly");
  return (await promisify<StoredAnswer | undefined>(answers.get(key))) ?? null;
}

/** This answer while it is still to be sent. */
export async function keptAnswer(key: string): Promise<KeptAnswer | null> {
  const found = await storedAnswer(key);
  return found && !isSettled(found) ? found : null;
}

/** The outcome of this answer when the server has given one. */
export async function settledOf(key: string): Promise<Settled | null> {
  const found = await storedAnswer(key);
  return found && isSettled(found) ? found.sent : null;
}
