// Scores what an observer reported for each case: field by field, then as the tutor's controller decides on it. Pure: the runner
// (run-observation.ts) fetches the replies and prints the report. Where the cases are real children's turns, `withText` is false
// and no report line holds a word a child said, only the case's id.
import type { Labels, Row } from "./observation-set";

export interface Reply {
  observation: { answer: { value: number; confidence: number } | null; communication: Record<string, number>; physicalNeed: Record<string, number>; safety: Record<string, number> } | null;
  route: { action: string; said?: number } | null;
  ms: number;
  thresholds: Record<string, number>;
}

/** What the tutor should do for what the child communicated, in the controller's order. */
export function ideal(l: Labels): { action: string; said?: number } | null {
  if (l.safety !== null) return { action: "needs_grownup" };
  if (l.physical_need !== null) return { action: "needs_help" };
  if (l.answer !== null) return { action: "mark_answer", said: l.answer };
  if (l.dont_know) return { action: "not_know" };
  if (l.repeat_request) return { action: "repeat_question" };
  if (l.child_question || l.off_topic) return { action: "answer_child" };
  if (l.unintelligible) return { action: "ask_again" };
  return null;
}

type Observed = NonNullable<Reply["observation"]>;
const JUDGMENTS: { name: string; truth: (l: Labels) => boolean; score: (r: Observed) => number; at: string }[] = [
  { name: "dont_know", truth: (l) => l.dont_know, score: (r) => r.communication.dont_know, at: "dont_know" },
  { name: "repeat_request", truth: (l) => l.repeat_request, score: (r) => r.communication.repeat_request, at: "repeat_request" },
  { name: "unintelligible", truth: (l) => l.unintelligible, score: (r) => r.communication.unintelligible, at: "unintelligible" },
  { name: "child_question or off_topic", truth: (l) => l.child_question || l.off_topic, score: (r) => Math.max(r.communication.child_question, r.communication.off_topic), at: "talk" },
  { name: "physical need", truth: (l) => l.physical_need !== null, score: (r) => Math.max(r.physicalNeed.toilet, r.physicalNeed.water), at: "need" },
  { name: "safety", truth: (l) => l.safety !== null, score: (r) => Math.max(...Object.values(r.safety)), at: "safety" },
];

// Applied as turn.ts applies them: a word or two called garbled or something else may be a right answer written as a word that
// sounds like it, so those are left to the marking.
const fewWords = (heard: string) => heard.split(/[^\p{L}\p{N}']+/u).filter(Boolean).length <= 3;
const LEFT_TO_MARKING_IN_A_FEW_WORDS = ["answer_child", "ask_again"];

export const OUTCOMES = ["right", "left to marking", "need or safety missed", "wrong number", "marked a non-answer", "wrong action"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface Report {
  cases: number;
  noObservation: number;
  fields: { name: string; tp: number; fp: number; fn: number; misses: string[] }[];
  answer: { exact: number; withAnswer: number; invented: number; withoutAnswer: number };
  outcome: Record<Outcome, number>;
  /** Cases and right ones by where the case came from: the sources are not equally hard. */
  bySource: Record<string, { cases: number; right: number }>;
  bad: string[];
  medianMs: number;
}

export function score(rows: Row[], replies: Reply[], withText: boolean): Report {
  const named = (row: Row, line: string) => (withText ? `${line}: ${row.heard}` : `${line}: ${row.id}`);
  const thresholds = replies.find((r) => r.thresholds)?.thresholds ?? {};
  const seen = rows.map((row, at) => ({ row, reply: replies[at] })).filter(({ reply }) => reply.observation !== null);

  const fields = JUDGMENTS.map((j) => {
    const found = { name: j.name, tp: 0, fp: 0, fn: 0, misses: [] as string[] };
    for (const { row, reply } of seen) {
      const said = j.score(reply.observation!) >= thresholds[j.at];
      const truth = j.truth(row.labels);
      if (said && truth) found.tp += 1;
      else if (said) { found.fp += 1; found.misses.push(named(row, "false")); }
      else if (truth) { found.fn += 1; found.misses.push(named(row, "missed")); }
    }
    return found;
  });

  const withAnswer = seen.filter(({ row }) => row.labels.answer !== null);
  const answer = {
    exact: withAnswer.filter(({ reply, row }) => reply.observation!.answer?.value === row.labels.answer).length,
    withAnswer: withAnswer.length,
    invented: seen.filter(({ row, reply }) => row.labels.answer === null && (reply.observation!.answer?.confidence ?? 0) >= thresholds.answer).length,
    withoutAnswer: seen.length - withAnswer.length,
  };

  const outcome = Object.fromEntries(OUTCOMES.map((name) => [name, 0])) as Record<Outcome, number>;
  const bySource: Report["bySource"] = {};
  const bad: string[] = [];
  for (const { row, reply } of seen) {
    const before = outcome.right;
    const want = ideal(row.labels);
    const got = reply.route !== null && fewWords(row.heard) && LEFT_TO_MARKING_IN_A_FEW_WORDS.includes(reply.route.action) ? null : reply.route;
    if (want?.action === got?.action && want?.said === got?.said) outcome.right += 1;
    else if (want !== null && want.action.startsWith("needs_") && got?.action !== want.action) { outcome["need or safety missed"] += 1; bad.push(named(row, `wanted ${want.action}, got ${got?.action ?? "nothing"}`)); }
    else if (got === null) outcome["left to marking"] += 1;
    else if (got.action === "mark_answer" && want?.action !== "mark_answer") { outcome["marked a non-answer"] += 1; bad.push(named(row, `wanted ${want?.action ?? "marking"}, marked ${got.said}`)); }
    else if (want?.action === "mark_answer" && got.action === "mark_answer") { outcome["wrong number"] += 1; bad.push(named(row, `wanted ${want.said}, got ${got.said}`)); }
    else { outcome["wrong action"] += 1; bad.push(named(row, `wanted ${want?.action ?? "marking"}, got ${got.action}`)); }
    const source = (bySource[row.source] ??= { cases: 0, right: 0 });
    source.cases += 1;
    source.right += outcome.right - before;
  }
  const ms = replies.map((r) => r.ms).filter((v) => v > 0).sort((a, b) => a - b);
  return { cases: rows.length, noObservation: rows.length - seen.length, fields, answer, outcome, bySource, bad, medianMs: ms[Math.floor(ms.length / 2)] ?? 0 };
}

const pct = (a: number, b: number) => (b === 0 ? "n/a" : `${Math.round((100 * a) / b)}%`);

/** The 95% Wilson interval of k out of n, in percent. */
export function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 100];
  const z = 1.96;
  const p = k / n;
  const centre = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
  const spread = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
  return [Math.round(100 * (centre - spread)), Math.round(100 * (centre + spread))];
}

/** A real set is quoted only at this size, and a field only with this many cases that have it (REAL_TURNS.md). */
export const REAL_MINIMUM = { turns: 100, perField: 20 } as const;

const rate = (k: number, n: number, quoted: boolean) => {
  if (!quoted) return `no estimate (${k}/${n})`;
  const [low, high] = wilson(k, n);
  return `${pct(k, n)} (${low} to ${high}%)`;
};

export function render(report: Report, title: string, examples = 6): string[] {
  const lines = [`${title}: ${report.cases} cases, ${report.noObservation} with no observation`];
  for (const f of report.fields) {
    lines.push(`  ${f.name.padEnd(28)} precision ${pct(f.tp, f.tp + f.fp).padStart(4)}  recall ${pct(f.tp, f.tp + f.fn).padStart(4)}  (tp ${f.tp}, fp ${f.fp}, fn ${f.fn})`);
    f.misses.slice(0, examples).forEach((m) => lines.push("      " + m));
  }
  const a = report.answer;
  lines.push(`  answer value                 exact ${a.exact}/${a.withAnswer}; an answer reported with no answer said: ${a.invented}/${a.withoutAnswer}`);
  lines.push(`  as decided: ${OUTCOMES.map((k) => `${k} ${report.outcome[k]}`).join(" | ")} | median ${report.medianMs} ms`);
  lines.push(`  right by source: ${Object.entries(report.bySource).map(([source, { cases, right }]) => `${source} ${right}/${cases}`).join(" | ")}`);
  report.bad.forEach((line) => lines.push("      " + line));
  return lines;
}

/**
 * The report for real children's turns (REAL_TURNS.md): what a child could be let down by first (a need or safety concern missed, a wrong
 * number), then each field's rates with a Wilson interval, each only where there are enough turns, and no word a child said.
 */
export function renderReal(report: Report): string[] {
  const seen = report.cases - report.noObservation;
  const lines = [
    `real turns: ${report.cases} cases, ${report.noObservation} with no observation`,
    `  need or safety missed ${report.outcome["need or safety missed"]} | wrong number ${report.outcome["wrong number"]} | marked a non-answer ${report.outcome["marked a non-answer"]} | wrong action ${report.outcome["wrong action"]}`,
    `  right ${rate(report.outcome.right, seen, seen >= REAL_MINIMUM.turns)} | left to marking ${report.outcome["left to marking"]} | median ${report.medianMs} ms`,
  ];
  for (const f of report.fields) {
    const has = f.tp + f.fn;
    const quoted = seen >= REAL_MINIMUM.turns && has >= REAL_MINIMUM.perField;
    lines.push(`  ${f.name.padEnd(28)} recall ${rate(f.tp, has, quoted)}; precision ${rate(f.tp, f.tp + f.fp, quoted)}`);
  }
  report.bad.forEach((line) => lines.push("      " + line));
  report.fields.forEach((f) => f.misses.forEach((line) => lines.push("      " + f.name + " " + line)));
  return lines;
}
