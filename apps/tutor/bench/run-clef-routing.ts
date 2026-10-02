// Scores Clef and Clef-flash as the router, on bench/routing.jsonl, the same cases as run-routing.ts: the action each
// would choose at a few confidence thresholds, what is handed on below one, and how long the call takes inside the Worker.
//   npx wrangler dev --remote --config bench/wrangler.jsonc --port 8799   then   node bench/run-clef-routing.ts
import { readFileSync } from "node:fs";

const URL_ = process.argv[2] ?? "http://localhost:8799";
const PROMPT = "One heap has five oranges. How many oranges are in two heaps?";
const rows = readFileSync(new URL("./routing.jsonl", import.meta.url).pathname, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { heard: string; expect: string });

for (const model of ["clef", "clef-flash"] as const) {
  const out = await Promise.all(rows.map(async (row) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const r = (await (await fetch(URL_ + "/clef-route", { method: "POST", body: JSON.stringify({ heard: row.heard, prompt: PROMPT, model }) })).json()) as { probabilities: Record<string, number> | null; ms: number };
        if (r.probabilities) return r;
      } catch { /* try again */ }
    }
    return { probabilities: null, ms: 0 };
  }));
  const ms = out.map((o) => o.ms).filter((v) => v > 0).sort((a, b) => a - b);
  console.log(`\n${model}: median ${ms[Math.floor(ms.length / 2)]} ms, p90 ${ms[Math.floor(ms.length * 0.9)]} ms inside the Worker`);
  for (const threshold of [0, 0.5, 0.7, 0.85]) {
    const c = { right: 0, handed: 0, wrong: 0, lostAnswer: 0, falseAnswer: 0, grownupMissed: 0 };
    rows.forEach((row, at) => {
      const p = out[at].probabilities;
      if (!p) { c.handed += 1; return; }
      const [action, top] = Object.entries(p).reduce((best, entry) => (entry[1] > best[1] ? entry : best));
      if (top < threshold) { c.handed += 1; return; }
      if (action === row.expect) c.right += 1;
      else {
        c.wrong += 1;
        if (row.expect === "mark_answer") c.lostAnswer += 1;
        if (action === "mark_answer" && row.expect !== "mark_answer") c.falseAnswer += 1;
        if (row.expect === "needs_grownup") c.grownupMissed += 1;
      }
    });
    console.log(`  threshold ${String(threshold).padEnd(4)}: right ${c.right}/${rows.length} | handed on ${c.handed} | wrong ${c.wrong} (a right answer routed away ${c.lostAnswer}, a non-answer routed to mark ${c.falseAnswer}, a hurt child missed ${c.grownupMissed})`);
  }
}
