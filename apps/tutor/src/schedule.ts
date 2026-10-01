import type { Verdict } from "./mark";

/** What the memory is told about an answer: how it was marked, or that it passed only with help. */
export type Remembered = Verdict | "helped";
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type Card,
  type FSRS,
} from "ts-fsrs";

/** How weak an item may be before it is worth asking again. */
export const RETENTION = 0.9;
/** What a four-minute sitting holds, and how much of it may be new material. */
export const SITTING = 6;
export const NEW_PER_SITTING = 2;

/** One thing to say from memory, and what is remembered about saying it. */
export interface ItemMemory {
  item: string;
  card: Card;
}

/** The items a sitting asks for, in the order they are asked. */
export interface Sitting {
  due: string[];
  fresh: string[];
}

const scheduler: FSRS = fsrs(generatorParameters({ request_retention: RETENTION }));

export function newMemory(item: string, now: Date): ItemMemory {
  return { item, card: createEmptyCard(now) };
}

export function retrievability(memory: ItemMemory, now: Date): number {
  return scheduler.get_retrievability(memory.card, now, false);
}

/**
 * A verdict moves an item along the spacing, or back to the start, or nowhere at all.
 *
 * A pass that took help is rated Hard: the item comes back sooner than one known alone. A near miss in
 * how it was said is still a pass.
 *
 * Unheard returns the memory untouched on purpose: silence and dropped provider calls say
 * something about the microphone, never about the child, and writing a failure for one is the
 * bug that visibly punishes a learner who was right.
 */
export function remember(memory: ItemMemory, verdict: Remembered, now: Date): ItemMemory {
  if (verdict === "unheard") return memory;
  const rating = verdict === "wrong" ? Rating.Again : verdict === "helped" ? Rating.Hard : Rating.Good;
  return { item: memory.item, card: scheduler.next(memory.card, now, rating).card };
}

/**
 * What to ask now: the weakest things this learner knows, then a little new material.
 *
 * Ranking by weakness rather than by due date is deliberate. A sitting is a fixed budget of four
 * minutes, so the question is always "which six are weakest", never "which are technically due" —
 * on some days nothing is due and on others fifteen things are.
 */
export function chooseSitting(
  known: ItemMemory[],
  everyItem: string[],
  now: Date,
  budget = SITTING,
  newAllowed = NEW_PER_SITTING,
): Sitting {
  const weakestFirst = [...known].sort(
    (left, right) => retrievability(left, now) - retrievability(right, now),
  );
  const due = weakestFirst
    .filter((memory) => retrievability(memory, now) < RETENTION)
    .slice(0, budget)
    .map((memory) => memory.item);
  const seen = new Set(known.map((memory) => memory.item));
  const room = Math.max(0, budget - due.length);
  const fresh = everyItem
    .filter((item) => !seen.has(item))
    .slice(0, Math.min(newAllowed, room));
  return { due, fresh };
}
