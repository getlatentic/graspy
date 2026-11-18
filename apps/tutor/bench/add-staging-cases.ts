// Turns the answers of the pedagogy rig's staging runs (bench/interpretation.jsonl) into observation cases. The voice is a
// cloned adult voice pitched up, so these are NOT children: they are staging recordings of a simulated child, which show
// the recogniser's mistakes.
//
// What is labelled is what the written words carry, with what the child meant kept in `meant`:
//  - a number the child meant stays that number where the written words could be it (a sound-alike such as "then" or "tin");
//  - where they cannot ("Chainsaw" for ten) the case is labelled garbled, which is the right thing for a reader to say;
//  - where the words hold a different number than the one meant ("14" for forty, "210" for ten) the case is left out, since
//    it cannot be told apart from a child who said that number.
// Node 24.2 or later:  node bench/add-staging-cases.ts
import { appendFileSync, readFileSync } from "node:fs";
import { loadSet, SET_PATH, type Labels, type Row } from "./observation-set.ts";
import { numberWords, PROMPTS, sameWords } from "./template-cases.ts";

interface Recorded { truth: "number" | "dont_know" | "unclear"; value?: number; meant: string; heard: string }

const NONE: Labels = { answer: null, dont_know: false, repeat_request: false, physical_need: null, safety: null, child_question: false, off_topic: false, unintelligible: false };
const LEFT_OUT = new Set(["Two, two.", "two, three", "12, 10", "210", "14"]);
const GARBLED = new Set(["Fiennes", "So", "to moon sink", "To me, you sink.", "Premisetina", "to music.", "Chainsaw", "To me, sink", "To me, sink.", "Items", "Item none.", "Item non", "items"]);

const recorded = readFileSync(new URL("./interpretation.jsonl", import.meta.url).pathname, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Recorded);

function labelsOf(row: Recorded): Labels {
  if (GARBLED.has(row.heard)) return { ...NONE, unintelligible: true };
  if (row.truth === "number") return { ...NONE, answer: row.value! };
  if (row.truth === "dont_know") return { ...NONE, dont_know: true };
  return { ...NONE, off_topic: true };
}

function promptFor(row: Recorded, at: number): { prompt: string; expected: number } {
  const same = PROMPTS.filter((p) => p.expected === row.value);
  if (same.length > 0) return same[at % same.length];
  if (row.truth === "number") return { prompt: `What is one plus ${numberWords(row.value! - 1)}?`, expected: row.value! };
  return PROMPTS[at % PROMPTS.length];
}

const have = loadSet();
const ids = new Set(have.map((row) => row.id));
const texts = new Set(have.map(sameWords));
const fresh: Row[] = [];
recorded.forEach((row, at) => {
  if (LEFT_OUT.has(row.heard)) return;
  const { prompt, expected } = promptFor(row, at);
  const made: Row = { id: `stg-${String(at + 1).padStart(3, "0")}`, source: "staging", heard: row.heard, prompt, expected, labels: labelsOf(row), ...(row.meant !== row.heard ? { meant: row.meant } : {}) };
  if (ids.has(made.id) || texts.has(sameWords(made))) return;
  texts.add(sameWords(made));
  fresh.push(made);
});
appendFileSync(SET_PATH, fresh.map((row) => JSON.stringify(row) + "\n").join(""));
console.log(`${fresh.length} staging cases added`);
