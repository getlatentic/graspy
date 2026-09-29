import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { heardSequence } from "../src/plain-sequence";
import { markSequence } from "../src/recite";

const PLANS = new URL("../../server/src/app/voice/lesson_plans/plans/", import.meta.url).pathname;

function planFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? planFiles(path) : path.endsWith(".json") ? [path] : [];
  });
}

interface Item {
  id: string;
  spoken: string[];
}

const activities = planFiles(PLANS).flatMap((file) => {
  const plan = JSON.parse(readFileSync(file, "utf8")) as { id: string; events: { id: string; activity?: { kind: string; items?: { id: string; spoken: Record<string, string[]> }[] } }[] };
  return plan.events.flatMap((event) => (event.activity?.kind === "sequence" ? [{ name: `${plan.id} ${event.id}`, items: event.activity.items ?? [] }] : []));
});

const forLanguage = (items: { id: string; spoken: Record<string, string[]> }[], language: string): Item[] =>
  items.map((item) => ({ id: item.id, spoken: item.spoken[language] ?? item.spoken.en }));

const say = (items: Item[], pick: (item: Item) => string, order: number[]) => order.map((at) => pick(items[at])).join(", ");
const upTo = (n: number) => Array.from({ length: n }, (_, i) => i);
const verdict = (items: Item[], said: string) => {
  const heard = heardSequence(items, said);
  return heard === null ? "not plain" : markSequence(items, heard, said).verdict;
};

describe("every real list question, in English, Pidgin and Yoruba", () => {
  it("has the lists it is meant to cover", () => {
    expect(activities.length).toBeGreaterThan(40);
  });

  for (const language of ["en", "pcm", "yo"]) {
    describe(language, () => {
      for (const { name, items: raw } of activities) {
        const items = forLanguage(raw, language);
        const first = (item: Item) => item.spoken[0];
        const last = (item: Item) => item.spoken[item.spoken.length - 1];
        const n = items.length;

        it(`${name}: the right list is right, by its first or its last spelling`, () => {
          expect(verdict(items, say(items, first, upTo(n)))).toBe("correct");
          expect(verdict(items, say(items, last, upTo(n)))).toBe("correct");
        });

        it(`${name}: a skipped, swapped or shortened list is not right`, () => {
          if (n < 3) return;
          const skipped = upTo(n).filter((at) => at !== 1);
          const swapped = upTo(n);
          [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
          for (const order of [skipped, swapped, upTo(n - 1)]) {
            for (const pick of [first, last]) {
              const result = verdict(items, say(items, pick, order));
              expect(["wrong", "not plain"], `${name}: ${say(items, pick, order)}`).toContain(result);
            }
          }
        });
      }
    });
  }
});

describe("lists that need care", () => {
  const tens = activities.find((row) => row.name.startsWith("mathematics.number.counting-in-tens") && row.items.some((item) => item.id === "120"))?.items ?? [];

  it("marks a count in tens to a hundred and twenty right, in words with 'and'", () => {
    const items = forLanguage(tens, "en");
    const said = "ten, twenty, thirty, forty, fifty, sixty, seventy, eighty, ninety, one hundred, one hundred and ten, one hundred and twenty";
    expect(items.some((item) => item.spoken.some((alias) => alias.includes("one hundred and ten")))).toBe(true);
    expect(verdict(items, said)).toBe("correct");
  });

  it("sends the same count with no pauses to the model, where 'ninety one hundred' could be read two ways", () => {
    const said = "ten twenty thirty forty fifty sixty seventy eighty ninety one hundred one hundred and ten one hundred and twenty";
    expect(verdict(forLanguage(tens, "en"), said)).toBe("not plain");
  });

  it("sends 'one hundred ten', which no item spells that way, to the model to be read", () => {
    expect(verdict(forLanguage(tens, "en"), "ten twenty one hundred ten")).toBe("not plain");
  });

  it("keeps Yoruba two and eight apart", () => {
    const items = [{ id: "2", spoken: ["2", "méjì"] }, { id: "8", spoken: ["8", "mẹ́jọ"] }];
    expect(heardSequence(items, "méjì, mẹ́jọ")).toEqual(["mejo".replace("jo", "ji"), "mejo"]);
    expect(verdict(items, "mẹ́jọ, méjì")).toBe("wrong");
    expect(verdict(items, "méjì, mẹ́jọ")).toBe("correct");
  });

  it("does not read 'sixty five' as sixty and five when it is not an item", () => {
    const fives = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map((k) => ({ id: String(k), spoken: [String(k)] }));
    expect(verdict([...fives.slice(0, 11), { id: "60", spoken: ["60", "sixty"] }, { id: "5x", spoken: ["five"] }], "5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, sixty five")).toBe("wrong");
  });

  it("does not read another script as plain", () => {
    expect(verdict(forLanguage(tens, "en"), "10, 20, ٦")).toBe("not plain");
    expect(verdict(forLanguage(tens, "en"), "10, 20, こんにちは")).toBe("not plain");
  });
});
