// Scores what the router would do with what a child said, on bench/routing.jsonl, after the rules turn.ts applies:
// a word or two is only acted on as "does not know" or "asks to hear it again", and anything else is left to the
// marking. A routing that is a different action from the right one is the mistake that matters.
//   npx wrangler dev --remote --config bench/wrangler.jsonc --port 8799   (with AWS_BEARER_TOKEN_BEDROCK in bench/.dev.vars)
//   node bench/run-routing.ts [http://localhost:8799]
import { readFileSync } from "node:fs";

const URL_ = process.argv[2] ?? "http://localhost:8799";
const MODEL = process.argv[3] ?? "gemma";
const THRESHOLD = Number(process.argv[4] ?? 0.7);
if (!Number.isFinite(THRESHOLD)) throw new Error(`threshold must be a number, not ${process.argv[4]}`);
const PROMPT = "One heap has five oranges. How many oranges are in two heaps?";
const rows = readFileSync(new URL("./routing.jsonl", import.meta.url).pathname, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { heard: string; expect: string; value?: number });
const SAFE_FOR_FEW_WORDS = ["not_know", "repeat_question", "needs_help", "needs_grownup"];
const fewWords = (heard: string) => heard.split(/[^\p{L}\p{N}']+/u).filter(Boolean).length <= 3;

const out = await Promise.all(rows.map(async (row) => {
  const r = (await (await fetch(URL_ + "/route", { method: "POST", body: JSON.stringify({ heard: row.heard, prompt: PROMPT, model: MODEL, threshold: THRESHOLD }) })).json()) as { route: { action: string; said?: number } | null; ms: number; accepted: boolean; mayBeAnAnswer: boolean; soundsLikeTheAnswer: boolean; foundBySafetyRule: boolean };
  const action = r.route?.action ?? null;
  if (action === null) return { taken: "marking", ms: r.ms };
  // An answer is marked only when the number it reports sounds like the words, and is then right only if it is the number said.
  // Clef gives no number: "an answer" goes to the usual reading, which is right for an answer and harmless for anything
  // but a need, which an answer would have marked instead of letting the child go.
  if (action === "mark_answer" && MODEL !== "gemma") return { taken: row.expect === "mark_answer" || row.expect.startsWith("needs_") ? "mark_answer" : "marking", ms: r.ms };
  if (action === "mark_answer") return { taken: r.accepted && (row.value === undefined || r.route?.said === row.value) ? "mark_answer" : r.accepted ? "wrong number" : "marking", ms: r.ms };
  // A need the safety rule did not find is, in words that are only the answer misheard, the answer; in words that may be one, left to the marking.
  if (action.startsWith("needs_") && !r.foundBySafetyRule) {
    if (r.soundsLikeTheAnswer) return { taken: "mark_answer", ms: r.ms };
    if (r.mayBeAnAnswer) return { taken: "marking", ms: r.ms };
  } else if (r.mayBeAnAnswer && !action.startsWith("needs_")) return { taken: "marking", ms: r.ms };
  return { taken: fewWords(row.heard) && !SAFE_FOR_FEW_WORDS.includes(action) ? "marking" : action, ms: r.ms };
}));

const counts = { right: 0, "left to marking": 0, "wrong action": 0 };
const wrong: string[] = [];
rows.forEach((row, at) => {
  const { taken } = out[at];
  if (taken === row.expect) counts.right += 1;
  else if (taken === "marking") counts["left to marking"] += 1;
  else { counts["wrong action"] += 1; wrong.push(`${JSON.stringify(row.heard)} should be ${row.expect}, routed ${taken}`); }
});
const ms = out.map((o) => o.ms).filter((v) => v > 0).sort((a, b) => a - b);
console.log(`${MODEL}${MODEL === "gemma" ? "" : " at " + THRESHOLD}: ${rows.length} cases | right ${counts.right} | left to marking ${counts["left to marking"]} | wrong action ${counts["wrong action"]} | median ${ms[Math.floor(ms.length / 2)] ?? 0} ms`);
wrong.forEach((line) => console.log("  wrong:", line));
