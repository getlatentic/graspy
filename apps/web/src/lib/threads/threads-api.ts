import { getJson, sendJson } from "@/lib/api/request";
import { API_BASE_URL } from "@/lib/env";
import { readChanges, type Changes, type WireThread } from "./thread-wire";

// The conversations a signed-in learner's devices share (app/api/thread_routes.py). `still`,
// asked as each request is sent, stops it once the session is no longer the learner's.

const THREADS_URL = `${API_BASE_URL}/learner/threads`;

interface Kept {
  seq: number;
}

/** The seq the server kept them under. */
export async function sendThreads(
  threads: WireThread[],
  still?: () => boolean,
): Promise<number> {
  const { seq } = await sendJson<Kept>(THREADS_URL, "POST", { threads }, still);
  if (!Number.isInteger(seq)) throw new Error("The server kept no seq");
  return seq;
}

export interface Reading {
  since: number;
  upTo?: number;
  after?: string;
}

export async function changedThreads(
  { since, upTo, after }: Reading,
  still?: () => boolean,
): Promise<Changes> {
  const query = new URLSearchParams({ since: String(since) });
  if (upTo !== undefined) query.set("upTo", String(upTo));
  if (after !== undefined) query.set("after", after);
  return readChanges(await getJson<unknown>(`${THREADS_URL}?${query}`, still));
}
