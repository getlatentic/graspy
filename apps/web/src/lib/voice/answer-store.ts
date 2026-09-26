import { committed, openDB, promisify, VOICE_ANSWER_STORE } from "@/lib/idb";
import type { SampleMetadata } from "./voice-types";

/** A spoken answer on the device, from the moment it is recorded until the server has marked it. */
export interface KeptAnswer {
  /** Its Idempotency-Key: sent again, it names the same recording. */
  key: string;
  learner: string;
  metadata: SampleMetadata;
  wav: Blob;
  keptAt: number;
  sampleId?: string;
  uploadPath?: string | null;
  uploaded?: boolean;
}

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

export async function keptAnswers(learner: string): Promise<KeptAnswer[]> {
  const { answers } = await store("readonly");
  const all = await promisify<KeptAnswer[]>(answers.getAll());
  return all
    .filter((answer) => answer.learner === learner)
    .sort((a, b) => a.keptAt - b.keptAt);
}
