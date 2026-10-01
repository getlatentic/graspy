// Builds bench/interpretation.jsonl from the pedagogy rig's runs: what the simulated child meant to say, and the
// words a recogniser wrote for it. Text only; the voice is a cloned, pitched-up one, so these are not children.
// Run from apps/tutor: node bench/build-corpus.ts
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RUNS = new URL("../../pedagogy/runs/", import.meta.url).pathname;
const OUT = new URL("./interpretation.jsonl", import.meta.url).pathname;

const ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENS = "- - twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
const NOT_KNOWING = /don'?t (know|remember)|do not (know|remember)|dunno|no idea|not sure|forgot/i;

function numberOf(said: string): number | null {
  const words = said.toLowerCase().replace(/-/g, " ").replace(/[.,!?]/g, "").trim().split(/\s+/);
  if (words.length === 1 && /^\d+$/.test(words[0])) return Number(words[0]);
  if (words.length === 1 && ONES.includes(words[0])) return ONES.indexOf(words[0]);
  if (words.length === 1 && TENS.includes(words[0])) return TENS.indexOf(words[0]) * 10;
  if (words.length === 2 && TENS.includes(words[0]) && ONES.indexOf(words[1]) > 0 && ONES.indexOf(words[1]) < 10) return TENS.indexOf(words[0]) * 10 + ONES.indexOf(words[1]);
  return null;
}

function mentionsANumber(said: string): boolean {
  return said.toLowerCase().split(/[^a-z0-9]+/).some((word) => /^\d+$/.test(word) || ONES.includes(word) || TENS.includes(word) || word === "hundred" || word === "tens" || word === "units" || word === "ones");
}

interface Turn { child?: { said?: string | null }; marking?: { heard?: string; provider?: string } | null }
const rows = new Map<string, object>();
for (const dir of readdirSync(RUNS)) {
  let run: { persona: string; turns: Turn[] };
  try { run = JSON.parse(readFileSync(join(RUNS, dir, "run.json"), "utf8")).run; } catch { continue; }
  for (const turn of run.turns) {
    const said = turn.child?.said, heard = turn.marking?.heard;
    if (!said || !heard) continue;
    let truth: { truth: string; value?: number } | null = null;
    // The off-topic child also counts and answers now and then; only what holds no number at all is "not an answer".
    if (run.persona === "offtopic") truth = mentionsANumber(said) ? null : { truth: "unclear" };
    else if (NOT_KNOWING.test(said)) truth = { truth: "dont_know" };
    else if (numberOf(said) !== null) truth = { truth: "number", value: numberOf(said)! };
    if (truth === null) continue;
    const row = { ...truth, meant: said, heard, provider: turn.marking?.provider };
    rows.set(JSON.stringify([truth.truth, truth.value, heard]), row);
  }
}
writeFileSync(OUT, [...rows.values()].map((row) => JSON.stringify(row)).join("\n") + "\n");
console.log(`${rows.size} distinct recognised answers written to ${OUT}`);
