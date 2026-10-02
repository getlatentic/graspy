// Scores what an observer reports for what a child said, on bench/observation.jsonl, field by field and then as the
// tutor's controller decides on it. Each field is a separate judgment with its own threshold, since a miss costs differently.
//   npx wrangler dev --remote --config bench/wrangler.jsonc --port 8799   (with AWS_BEARER_TOKEN_BEDROCK in bench/.dev.vars)
//   node bench/run-observation.ts [url] [gemma|clef|clef-flash] [dev|test|routing|all] ['{"talk":0.8}']
import { readFileSync } from "node:fs";

const URL_ = process.argv[2] ?? "http://localhost:8799";
const MODEL = process.argv[3] ?? "gemma";
const SPLIT = process.argv[4] ?? "all";
// Thresholds that differ from the policy's, as JSON: a model's probabilities are not another's.
const THRESHOLDS = JSON.parse(process.argv[5] ?? "{}") as Record<string, number>;

interface Labels {
  answer: number | null;
  dont_know: boolean;
  repeat_request: boolean;
  physical_need: "toilet" | "water" | null;
  safety: "illness" | "injury" | "fear" | "wants_grownup" | null;
  child_question: boolean;
  off_topic: boolean;
  unintelligible: boolean;
}
interface Row { heard: string; prompt: string; expected: number; labels: Labels; split: "dev" | "test"; set?: "routing" }
interface Reply {
  observation: { answer: { value: number; confidence: number } | null; communication: Record<string, number>; physicalNeed: Record<string, number>; safety: Record<string, number> } | null;
  route: { action: string; said?: number } | null;
  ms: number;
  thresholds: Record<string, number>;
}

const rows = readFileSync(new URL("./observation.jsonl", import.meta.url).pathname, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Row).filter((row) => SPLIT === "all" || row.split === SPLIT || row.set === SPLIT);

/** What the tutor should do for what the child communicated, in the controller's order. */
function ideal(l: Labels): { action: string; said?: number } | null {
  if (l.safety !== null) return { action: "needs_grownup" };
  if (l.physical_need !== null) return { action: "needs_help" };
  if (l.answer !== null) return { action: "mark_answer", said: l.answer };
  if (l.dont_know) return { action: "not_know" };
  if (l.repeat_request) return { action: "repeat_question" };
  if (l.child_question || l.off_topic) return { action: "answer_child" };
  if (l.unintelligible) return { action: "ask_again" };
  return null;
}

const ask = async (row: Row) => (await (await fetch(URL_ + "/observe", { method: "POST", body: JSON.stringify({ heard: row.heard, prompt: row.prompt, expected: row.expected, model: MODEL, thresholds: THRESHOLDS }) })).json()) as Reply;
// A few at a time: a whole set at once is throttled by the hosts, and the latency measured would be the queue's.
const replies: Reply[] = [];
for (let at = 0; at < rows.length; at += 4) replies.push(...(await Promise.all(rows.slice(at, at + 4).map(ask))));

const judgments: { name: string; truth: (l: Labels) => boolean; score: (r: NonNullable<Reply["observation"]>) => number; at: string }[] = [
  { name: "dont_know", truth: (l) => l.dont_know, score: (r) => r.communication.dont_know, at: "dont_know" },
  { name: "repeat_request", truth: (l) => l.repeat_request, score: (r) => r.communication.repeat_request, at: "repeat_request" },
  { name: "unintelligible", truth: (l) => l.unintelligible, score: (r) => r.communication.unintelligible, at: "unintelligible" },
  { name: "child_question or off_topic", truth: (l) => l.child_question || l.off_topic, score: (r) => Math.max(r.communication.child_question, r.communication.off_topic), at: "talk" },
  { name: "physical need", truth: (l) => l.physical_need !== null, score: (r) => Math.max(r.physicalNeed.toilet, r.physicalNeed.water), at: "need" },
  { name: "safety", truth: (l) => l.safety !== null, score: (r) => Math.max(...Object.values(r.safety)), at: "safety" },
];

const thresholds = replies.find((r) => r.thresholds)?.thresholds ?? {};
const seen = rows.map((row, at) => ({ row, reply: replies[at] })).filter(({ reply }) => reply.observation !== null);
console.log(`${MODEL}, ${SPLIT}: ${rows.length} cases, ${rows.length - seen.length} with no observation`);

for (const j of judgments) {
  let tp = 0, fp = 0, fn = 0;
  const misses: string[] = [];
  for (const { row, reply } of seen) {
    const said = j.score(reply.observation!) >= thresholds[j.at];
    const truth = j.truth(row.labels);
    if (said && truth) tp += 1;
    else if (said) { fp += 1; misses.push(`false: ${row.heard}`); }
    else if (truth) { fn += 1; misses.push(`missed: ${row.heard}`); }
  }
  const pct = (a: number, b: number) => (b === 0 ? "n/a" : `${Math.round((100 * a) / b)}%`);
  console.log(`  ${j.name.padEnd(28)} precision ${pct(tp, tp + fp).padStart(4)}  recall ${pct(tp, tp + fn).padStart(4)}  (tp ${tp}, fp ${fp}, fn ${fn})`);
  misses.slice(0, 6).forEach((m) => console.log("      " + m));
}

const withAnswer = seen.filter(({ row }) => row.labels.answer !== null);
const exact = withAnswer.filter(({ reply, row }) => reply.observation!.answer?.value === row.labels.answer).length;
const invented = seen.filter(({ row, reply }) => row.labels.answer === null && (reply.observation!.answer?.confidence ?? 0) >= thresholds.answer).length;
console.log(`  answer value                 exact ${exact}/${withAnswer.length}; an answer reported with no answer said: ${invented}/${seen.length - withAnswer.length}`);

const outcome = { right: 0, "left to marking": 0, "need or safety missed": 0, "wrong number": 0, "marked a non-answer": 0, "wrong action": 0 };
const bad: string[] = [];
for (const { row, reply } of seen) {
  const want = ideal(row.labels);
  const got = reply.route;
  if (want?.action === got?.action && want?.said === got?.said) outcome.right += 1;
  else if (got === null) outcome["left to marking"] += 1;
  else if (want !== null && want.action.startsWith("needs_") && got.action !== want.action) { outcome["need or safety missed"] += 1; bad.push(`${row.heard}: wanted ${want.action}, got ${got.action}`); }
  else if (got.action === "mark_answer" && want?.action !== "mark_answer") { outcome["marked a non-answer"] += 1; bad.push(`${row.heard}: wanted ${want?.action ?? "marking"}, marked ${got.said}`); }
  else if (want?.action === "mark_answer" && got.action === "mark_answer") { outcome["wrong number"] += 1; bad.push(`${row.heard}: wanted ${want.said}, got ${got.said}`); }
  else { outcome["wrong action"] += 1; bad.push(`${row.heard}: wanted ${want?.action ?? "marking"}, got ${got.action}`); }
}
const ms = replies.map((r) => r.ms).filter((v) => v > 0).sort((a, b) => a - b);
console.log(`  as decided: ${Object.entries(outcome).map(([k, v]) => `${k} ${v}`).join(" | ")} | median ${ms[Math.floor(ms.length / 2)] ?? 0} ms`);
bad.forEach((line) => console.log("      " + line));
