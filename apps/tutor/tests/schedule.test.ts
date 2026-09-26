import { describe, expect, it } from "vitest";
import {
  chooseSitting,
  newMemory,
  remember,
  retrievability,
  RETENTION,
  SITTING,
  type ItemMemory,
} from "../src/schedule";

const LETTERS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
const start = new Date("2026-09-07T17:00:00Z");
const day = (n: number) => new Date(start.getTime() + n * 86_400_000);

describe("what a verdict does to an item", () => {
  it("grows an item that was said correctly", () => {
    const answered = remember(newMemory("A", start), "correct", start);

    expect(answered.card.stability).toBeGreaterThan(1);
    expect(retrievability(answered, start)).toBeCloseTo(1, 2);
  });

  it("leaves an item weaker after a miss than after a correct answer", () => {
    const right = remember(newMemory("A", start), "correct", start);
    const wrong = remember(newMemory("A", start), "wrong", start);

    expect(wrong.card.stability).toBeLessThan(right.card.stability);
  });

  it("writes nothing at all when the answer was never heard", () => {
    const before = remember(newMemory("A", start), "correct", start);
    const after = remember(before, "unheard", day(3));

    expect(after).toBe(before);
  });

  it("treats a near miss as a pass, so an accent does not cost a mark", () => {
    const nearly = remember(newMemory("A", start), "nearly", start);
    const right = remember(newMemory("A", start), "correct", start);

    expect(nearly.card.stability).toBe(right.card.stability);
  });
});

describe("choosing a sitting", () => {
  it("gives a child who has never practised only new material", () => {
    const { due, fresh } = chooseSitting([], LETTERS, start);

    expect(due).toEqual([]);
    expect(fresh).toEqual(["A", "B"]);
  });

  it("asks the weakest items first, not the oldest", () => {
    const strong = remember(newMemory("A", start), "correct", start);
    const weak = remember(newMemory("B", start), "wrong", start);
    const known: ItemMemory[] = [strong, weak];

    const { due } = chooseSitting(known, LETTERS, day(1));

    expect(due[0]).toBe("B");
  });

  it("never asks for more than a sitting holds", () => {
    const known = LETTERS.map((item) => remember(newMemory(item, start), "wrong", start));

    const { due, fresh } = chooseSitting(known, LETTERS, day(2));

    expect(due.length).toBe(SITTING);
    expect(fresh).toEqual([]);
  });

  it("leaves an item alone until it has actually weakened", () => {
    const fresh = remember(newMemory("A", start), "correct", start);

    expect(retrievability(fresh, start)).toBeGreaterThan(RETENTION);
    expect(chooseSitting([fresh], ["A"], start).due).toEqual([]);
  });
});

describe("a fortnight of the alphabet", () => {
  it("introduces every letter and never overfills a sitting", () => {
    let known: ItemMemory[] = [];
    let biggest = 0;

    for (let d = 0; d < 14; d += 1) {
      const now = day(d);
      const { due, fresh } = chooseSitting(known, LETTERS, now);
      known = [...known, ...fresh.map((item) => newMemory(item, now))];
      biggest = Math.max(biggest, due.length + fresh.length);
      for (const item of [...due, ...fresh]) {
        const memory = known.find((one) => one.item === item);
        if (memory) {
          known = known.map((one) => (one.item === item ? remember(memory, "correct", now) : one));
        }
      }
    }

    expect(known.length).toBe(26);
    expect(biggest).toBeLessThanOrEqual(SITTING);
  });
});
