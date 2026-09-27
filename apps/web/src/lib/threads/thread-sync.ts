import {
  currentAccount,
  learnerKeyOf,
  learnerTurn,
} from "@/lib/account/account-store";
import { pinTo, type LearnerPin } from "@/lib/learner-pin";
import { markSent, takeIn, unsentThreads, type Unsent } from "./thread-store";
import { sentMessage, sentThread, type WireThread } from "./thread-wire";
import { changedThreads, sendThreads } from "./threads-api";

// A signed-in learner's conversations follow them to their other devices. Each sync sends
// what this device has not sent, then reads what changed since the seq it last read. A device
// signed out keeps its conversations to itself until it signs in; its first learner takes
// them. What is unsent is marked on the device, so a conversation had offline goes with the
// next sync and needs no queue.

const SINCE_KEY = "graspy.threads.since";

// What one request carries, within the server's limits (app/threads/wire.py).
const MAX_THREADS = 50;
const MAX_MESSAGES = 200;
const MAX_CHARS = 1_000_000;
// Messages kept while a send runs go with the next round; a few rounds catch a turn's.
const ROUNDS = 3;

type Pin = LearnerPin<string | null>;

function learnerInUse(): string | null {
  const account = currentAccount();
  return account && learnerKeyOf(account);
}

function sinceFor(learner: string): number {
  try {
    const kept = JSON.parse(window.localStorage.getItem(SINCE_KEY) ?? "null");
    return kept?.learner === learner && Number.isInteger(kept.since)
      ? kept.since
      : 0;
  } catch {
    return 0;
  }
}

function rememberSince(learner: string, since: number): void {
  try {
    window.localStorage.setItem(SINCE_KEY, JSON.stringify({ learner, since }));
  } catch {
    // Storage refused: the next sync reads everything again, and takes in each once.
  }
}

interface Batch {
  threads: WireThread[];
  sent: Unsent[];
}

const sizeOf = (value: unknown) => JSON.stringify(value).length;

/** Within each request's limits, a long conversation split over several. */
export function batches(unsent: readonly Unsent[]): Batch[] {
  const all: Batch[] = [];
  let batch: Batch = { threads: [], sent: [] };
  let messages = 0;
  let chars = 0;
  const close = () => {
    if (batch.threads.length > 0) all.push(batch);
    batch = { threads: [], sent: [] };
    messages = 0;
    chars = 0;
  };
  for (const { thread, messages: kept } of unsent) {
    const header = sentThread(thread, []);
    let part: { wire: WireThread; sent: Unsent } | null = null;
    const place = () => {
      if (batch.threads.length === MAX_THREADS) close();
      const placed = {
        wire: { ...header, messages: [] },
        sent: { thread, messages: [] },
      };
      batch.threads.push(placed.wire);
      batch.sent.push(placed.sent);
      chars += sizeOf(header);
      return placed;
    };
    for (const message of kept) {
      const wire = sentMessage(message);
      const size = sizeOf(wire);
      const full =
        messages === MAX_MESSAGES ||
        (batch.threads.length > 0 && chars + size > MAX_CHARS);
      if (full) {
        close();
        part = null;
      }
      part ??= place();
      part.wire.messages.push(wire);
      part.sent.messages.push(message);
      messages += 1;
      chars += size;
    }
    // A thread with nothing new but itself, as when its context arrived.
    if (!part) place();
  }
  close();
  return all;
}

async function sendAll(learner: string, pin: Pin): Promise<void> {
  for (let round = 0; round < ROUNDS; round += 1) {
    pin.hold();
    const unsent = await unsentThreads();
    if (unsent.length === 0) return;
    for (const { threads, sent } of batches(unsent)) {
      const before = sinceFor(learner);
      const seq = await sendThreads(threads, pin.holds);
      pin.hold();
      await markSent(sent);
      // Nothing was written between: what this device has read runs on to its own send.
      if (seq === before + 1) rememberSince(learner, seq);
    }
  }
}

async function readAll(learner: string, pin: Pin): Promise<Set<string>> {
  const known = sinceFor(learner);
  const first = await changedThreads({ since: known }, pin.holds);
  // A seq behind what this device read: everything is read again.
  const since = first.upTo < known ? 0 : known;
  let page =
    since === known ? first : await changedThreads({ since }, pin.holds);
  const changed = new Set<string>();
  for (;;) {
    pin.hold();
    for (const id of await takeIn(page.threads)) changed.add(id);
    if (!page.next) break;
    page = await changedThreads(
      { since, upTo: page.upTo, after: page.next },
      pin.holds,
    );
  }
  pin.hold();
  rememberSince(learner, page.upTo);
  return changed;
}

const listeners = new Set<(threadIds: Set<string>) => void>();

/** Told the threads a sync changed on this device, as it takes them in. */
export function onThreadsTakenIn(
  listener: (threadIds: Set<string>) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// A sync pinned to a learner the device has left holds none back for the next learner.
let last: { pin: Pin; done: Promise<unknown> } | null = null;

function inTurn<T>(pin: Pin, run: () => Promise<T>): Promise<T> {
  const before = last?.pin.holds() ? last.done : Promise.resolve();
  const running = before.then(run);
  last = { pin, done: running.catch(() => undefined) };
  return running;
}

async function syncOnce(learner: string, pin: Pin): Promise<void> {
  await sendAll(learner, pin);
  const changed = await readAll(learner, pin);
  if (changed.size === 0) return;
  for (const listener of listeners) listener(changed);
}

/** Sends and reads the learner's conversations; nothing while no learner is chosen. One sync
 * runs at a time for a learner, and it rejects with LearnerChanged once the device learns as
 * someone else. */
export function syncThreads(): Promise<void> {
  const pin = pinTo(learnerInUse(), learnerTurn);
  const { learner } = pin;
  if (!learner) return Promise.resolve();
  return inTurn(pin, () => syncOnce(learner, pin));
}

/** Sends what is unsent; false while some of it is still on the device only. */
export async function sentEveryThread(): Promise<boolean> {
  const pin = pinTo(learnerInUse(), learnerTurn);
  const { learner } = pin;
  if (!learner) return true;
  await inTurn(pin, () => sendAll(learner, pin)).catch((error: unknown) =>
    console.warn("Sending the conversations failed:", error),
  );
  return (await unsentThreads()).length === 0;
}
