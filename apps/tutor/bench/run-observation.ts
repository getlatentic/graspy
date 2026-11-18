// Scores what an observer reports for what a child said, on bench/observation.jsonl, field by field and then as the tutor's
// controller decides on it. Each field is a separate judgment with its own threshold, since a miss costs differently.
//   npx wrangler dev --config bench/wrangler.jsonc --port 8799   (with AWS_BEARER_TOKEN_BEDROCK in bench/.dev.vars)
//   node bench/run-observation.ts [url] [gemma|clef|clef-flash] [train|dev|test|routing|all|real] ['{"talk":0.8}']
// The split of a case is a function of its id (observation-set.ts). Thresholds may be changed only when scoring on dev or train:
// test is read once per change to the model or the policy, and "real" (real children's turns, from the file GRASPY_REAL_TURNS names)
// is never used to tune and prints no word a child said (REAL_TURNS.md).
import { canTuneOn, casesOf, loadReal, loadSet } from "./observation-set.ts";
import { render, score, type Reply } from "./observation-score.ts";

const URL_ = process.argv[2] ?? "http://localhost:8799";
const MODEL = process.argv[3] ?? "gemma";
const SPLIT = process.argv[4] ?? "dev";
// Thresholds that differ from the policy's, as JSON: a model's probabilities are not another's.
const THRESHOLDS = JSON.parse(process.argv[5] ?? "{}") as Record<string, number>;
const tuned = Object.keys(THRESHOLDS).length > 0;
if (tuned && !canTuneOn(SPLIT)) throw new Error(`thresholds are chosen on dev; ${SPLIT} is scored with the policy's own`);

const isReal = SPLIT === "real";
let rows;
if (isReal) {
  const path = process.env.GRASPY_REAL_TURNS;
  if (path === undefined) throw new Error("GRASPY_REAL_TURNS names the file of real turns, outside this repository");
  rows = loadReal(path);
} else {
  if (!["train", "dev", "test", "routing", "all"].includes(SPLIT)) throw new Error(`split is train, dev, test, routing, all or real, not ${SPLIT}`);
  rows = casesOf(loadSet(), SPLIT as "train" | "dev" | "test" | "routing" | "all");
}

const ask = async (row: (typeof rows)[number]) => (await (await fetch(URL_ + "/observe", { method: "POST", body: JSON.stringify({ heard: row.heard, prompt: row.prompt, expected: row.expected, model: MODEL, thresholds: THRESHOLDS }) })).json()) as Reply;
// A few at a time: a whole set at once is throttled by the hosts, and the latency measured would be the queue's.
const replies: Reply[] = [];
for (let at = 0; at < rows.length; at += 4) replies.push(...(await Promise.all(rows.slice(at, at + 4).map(ask))));

render(score(rows, replies, !isReal), `${MODEL}, ${SPLIT}`).forEach((line) => console.log(line));
