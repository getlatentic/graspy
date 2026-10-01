// Scores what the router would do with what a child said, on bench/routing.jsonl, after the rules turn.ts applies:
// a word or two is only acted on as "does not know" or "asks to hear it again", and anything else is left to the
// marking. A routing that is a different action from the right one is the mistake that matters.
//   npx wrangler dev --remote --config bench/wrangler.jsonc --port 8799   (with AWS_BEARER_TOKEN_BEDROCK in bench/.dev.vars)
//   node bench/run-routing.ts [http://localhost:8799]
import { readFileSync } from "node:fs";

const URL_ = process.argv[2] ?? "http://localhost:8799";
const PROMPT = "One heap has five oranges. How many oranges are in two heaps?";
const rows = readFileSync(new URL("./routing.jsonl", import.meta.url).pathname, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { heard: string; expect: string });
const SAFE_FOR_FEW_WORDS = ["not_know", "repeat_question"];
const fewWords = (heard: string) => heard.split(/[^\p{L}\p{N}']+/u).filter(Boolean).length <= 3;
const holdsANumber = (heard: string) => /\d|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b/i.test(heard);

const SOUND_ALIKES = ["to", "too", "for", "fore", "won", "ate", "nein"];
const out = await Promise.all(rows.map(async (row) => {
  if (holdsANumber(row.heard) || SOUND_ALIKES.includes(row.heard.toLowerCase().replace(/[^a-z]/g, ""))) return { taken: "marking", ms: 0 };
  const r = (await (await fetch(URL_ + "/route", { method: "POST", body: JSON.stringify({ heard: row.heard, prompt: PROMPT }) })).json()) as { route: { action: string } | null; ms: number };
  const action = r.route?.action ?? null;
  const taken = action === null || action === "mark_answer" || (fewWords(row.heard) && !SAFE_FOR_FEW_WORDS.includes(action)) ? "marking" : action;
  return { taken, ms: r.ms };
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
console.log(`${rows.length} cases | right ${counts.right} | left to marking ${counts["left to marking"]} | wrong action ${counts["wrong action"]} | median ${ms[Math.floor(ms.length / 2)] ?? 0} ms`);
wrong.forEach((line) => console.log("  wrong:", line));
