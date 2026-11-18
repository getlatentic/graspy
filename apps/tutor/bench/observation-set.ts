// The labelled set the observer is scored on (bench/observation.jsonl) and the rule that says which split each case is in.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const SET_PATH = new URL("./observation.jsonl", import.meta.url).pathname;

export interface Labels {
  answer: number | null;
  dont_know: boolean;
  repeat_request: boolean;
  physical_need: "toilet" | "water" | null;
  safety: "illness" | "injury" | "fear" | "wants_grownup" | null;
  child_question: boolean;
  off_topic: boolean;
  unintelligible: boolean;
}

/**
 * Where a case came from: written by hand, expanded from a hand-written template, a recorded staging run of the simulated child, or
 * written by gpt-oss-120b. "real" is a real child's turn, which is never in observation.jsonl (see REAL_TURNS.md).
 */
export type Source = "hand" | "template" | "staging" | "gpt-oss-120b" | "real";

export interface Row {
  /** Never changes once the case is in the file: the split is a function of it. */
  id: string;
  source: Source;
  heard: string;
  prompt: string;
  /** The number the question asks for. */
  expected: number;
  labels: Labels;
  /** The cases the router was scored on before the observer existed, so the two can be compared. */
  set?: "routing";
  /** For a staging case: what the simulated child meant to say, where that differs from the words the recogniser wrote. */
  meant?: string;
  /** Set where a person read the case's label against its words: kept as written, or changed. */
  review?: "agreed" | "relabelled";
}

/** Synthetic cases only. The real children's turns are a fourth set, "real", which this rule never assigns (see REAL_TURNS.md). */
export type Split = "train" | "dev" | "test";

/** Out of 100 buckets: below `train` is train, below `dev` is dev, the rest test. */
export const SPLIT_BUCKETS = { train: 60, dev: 80 } as const;

/**
 * The split of a case: the first eight hex digits of SHA-256 of its id, as a number, modulo 100. The id alone decides, so a case
 * never moves when others are added, removed or reordered, and anyone can recompute it in any language.
 */
export function splitOf(id: string): Split {
  const bucket = Number.parseInt(createHash("sha256").update(id).digest("hex").slice(0, 8), 16) % 100;
  return bucket < SPLIT_BUCKETS.train ? "train" : bucket < SPLIT_BUCKETS.dev ? "dev" : "test";
}

export const parseRows = (text: string): Row[] => text.trim().split("\n").map((line) => JSON.parse(line) as Row);

export const loadSet = (path = SET_PATH): Row[] => parseRows(readFileSync(path, "utf8"));

/** Where a tuning run may be scored, and where it may not: thresholds are chosen on dev, never on test or on real turns. */
export const canTuneOn = (which: string) => which === "dev" || which === "train";

/**
 * The real children's turns, from the file the environment names (never a path in this repository). Every row must say it is real,
 * so a synthetic file cannot be scored as held out by mistake and a real one cannot be mistaken for a synthetic set.
 */
export const loadReal = (path: string): Row[] => parseReal(readFileSync(path, "utf8"));

export function parseReal(text: string): Row[] {
  const rows = parseRows(text);
  const wrong = rows.filter((row) => row.source !== "real" || !/^real-\d+$/.test(row.id));
  if (wrong.length > 0) throw new Error(`${wrong.length} rows are not real turns (source "real", id "real-<number>")`);
  return rows;
}

/** The cases of a split, or of the router's earlier set, or all of them. */
export const casesOf = (rows: Row[], which: Split | "routing" | "all"): Row[] =>
  rows.filter((row) => which === "all" || (which === "routing" ? row.set === "routing" : splitOf(row.id) === which));

/** What is wrong with the set, one line each: empty when it can be scored and split. */
export function problems(rows: Row[]): string[] {
  const found: string[] = [];
  const ids = new Set<string>();
  const texts = new Set<string>();
  for (const row of rows) {
    if (typeof row.id !== "string" || row.id === "") found.push(`a case has no id: ${JSON.stringify(row.heard)}`);
    if (ids.has(row.id)) found.push(`id used twice: ${row.id}`);
    ids.add(row.id);
    const text = `${row.prompt}\n${row.heard}`;
    if (texts.has(text)) found.push(`${row.id}: the same words to the same question as an earlier case`);
    texts.add(text);
    if (row.source === "real") found.push(`${row.id}: a real child's turn is in the synthetic set`);
    if ("split" in row) found.push(`${row.id}: stores a split; the id decides it`);
    if (typeof row.heard !== "string" || row.heard.trim() === "") found.push(`${row.id}: nothing heard`);
    if (!Number.isInteger(row.expected)) found.push(`${row.id}: expected is no whole number`);
    found.push(...labelProblems(row));
  }
  return found;
}

function labelProblems({ id, labels: l }: Row): string[] {
  const found: string[] = [];
  if (l.answer !== null && !Number.isInteger(l.answer)) found.push(`${id}: answer is no whole number`);
  const says = [l.answer !== null, l.dont_know, l.repeat_request, l.child_question, l.off_topic, l.unintelligible];
  if (l.unintelligible && says.filter(Boolean).length > 1) found.push(`${id}: garbled words cannot also say something`);
  if (l.dont_know && l.answer !== null) found.push(`${id}: not knowing and an answer together`);
  if (l.physical_need !== null && l.safety !== null) found.push(`${id}: one turn is labelled with a need and a safety concern; label the one the controller acts on`);
  return found;
}
