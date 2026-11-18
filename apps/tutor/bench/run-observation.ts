// Scores what an observer reports for what a child said, on bench/observation.jsonl, field by field and then as the tutor's
// controller decides on it. Each field is a separate judgment with its own threshold, since a miss costs differently.
//   npx wrangler dev --config bench/wrangler.jsonc --port 8799   (with AWS_BEARER_TOKEN_BEDROCK in bench/.dev.vars)
//   node bench/run-observation.ts [url] [gemma|clef|clef-flash] [train|dev|test|routing|all|real] ['{"talk":0.8}']
// The split of a case is a function of its id (observation-set.ts). Thresholds may be changed only when scoring on dev or train:
// test is read once per change to the model or the policy, and "real" (real children's turns, from the file GRASPY_REAL_TURNS names)
// is never used to tune and prints no word a child said (REAL_TURNS.md).
import { canTuneOn, casesOf, loadReal, loadSet } from "./observation-set.ts";
import { render, renderReal, score, type Reply } from "./observation-score.ts";

const URL_ = process.argv[2] ?? "http://localhost:8799";
const MODEL = process.argv[3] ?? "gemma";
const SPLIT = process.argv[4] ?? "dev";
// Thresholds that differ from the policy's, as JSON: a model's probabilities are not another's.
const THRESHOLDS = JSON.parse(process.argv[5] ?? "{}") as Record<string, number>;
const tuned = Object.keys(THRESHOLDS).length > 0;
if (tuned && !canTuneOn(SPLIT)) throw new Error(`thresholds are chosen on dev; ${SPLIT} is scored with the policy's own`);

const isReal = SPLIT === "real";
// A real child's words go only to the bench Worker on this machine, whose own call is the observer's to Bedrock, the host the tutor uses: not to a
// Worker elsewhere and not to Clef, which the tutor does not use for them.
if (isReal && (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(URL_) || MODEL !== "gemma")) throw new Error("real turns are scored with gemma through a bench Worker on localhost");
let rows;
if (isReal) {
  const path = process.env.GRASPY_REAL_TURNS;
  if (path === undefined) throw new Error("GRASPY_REAL_TURNS names the file of real turns, outside this repository");
  rows = loadReal(path);
} else {
  if (!["train", "dev", "test", "routing", "all"].includes(SPLIT)) throw new Error(`split is train, dev, test, routing, all or real, not ${SPLIT}`);
  rows = casesOf(loadSet(), SPLIT as "train" | "dev" | "test" | "routing" | "all");
}

const NO_REPLY: Reply = { observation: null, route: null, ms: 0, thresholds: {} };
// A reply that is not the Worker's (an error page, a refusal) is a case with no observation.
async function ask(row: (typeof rows)[number]): Promise<Reply> {
  const response = await fetch(URL_ + "/observe", { method: "POST", body: JSON.stringify({ heard: row.heard, prompt: row.prompt, expected: row.expected, model: MODEL, thresholds: THRESHOLDS }) }).catch(() => null);
  const reply = response?.ok ? ((await response.json().catch(() => null)) as Reply | null) : null;
  return reply?.observation === undefined ? NO_REPLY : reply;
}
// A few at a time: a whole set at once is throttled by the hosts, and the latency measured would be the queue's.
const replies: Reply[] = [];
for (let at = 0; at < rows.length; at += 4) replies.push(...(await Promise.all(rows.slice(at, at + 4).map(ask))));

(isReal ? renderReal(score(rows, replies, false)) : render(score(rows, replies, true), `${MODEL}, ${SPLIT}`)).forEach((line) => console.log(line));
