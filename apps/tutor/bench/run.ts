// Scores the tutor's readers on bench/interpretation.jsonl: how often what a recognised answer was read as is right, a
// wrong answer or a wrong "I don't know" (the mistakes that matter), or asked again. Start the Worker first:
//   npx wrangler dev --remote --config bench/wrangler.jsonc --port 8799
// then, from apps/tutor: node bench/run.ts [http://localhost:8799]
import { readFileSync } from "node:fs";

const URL_ = process.argv[2] ?? "http://localhost:8799";
const rows = readFileSync(new URL("./interpretation.jsonl", import.meta.url).pathname, "utf8")
  .trim().split("\n").map((line) => JSON.parse(line) as { truth: string; value?: number; meant: string; heard: string });

type Reading = { kind: "number"; value: number } | { kind: "dont_know" } | { kind: "unclear" } | null;
interface Answer { legacy: Reading; legacyMs: number; clef: Reading; clefMs: number }

async function ask(heard: string): Promise<Answer> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(URL_, { method: "POST", body: JSON.stringify({ heard }) });
      if (response.ok) return (await response.json()) as Answer;
    } catch { /* try again */ }
  }
  return { legacy: null, legacyMs: 0, clef: null, clefMs: 0 };
}

const answers: Answer[] = new Array(rows.length);
let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < rows.length) { const at = next++; answers[at] = await ask(rows[at].heard); }
}));

function score(reading: Reading, row: (typeof rows)[number]): "right" | "wrong answer" | "wrong not-knowing" | "asked again" | "no answer" {
  if (reading === null) return "no answer";
  if (reading.kind === "unclear") return row.truth === "unclear" ? "right" : "asked again";
  if (reading.kind === "dont_know") return row.truth === "dont_know" ? "right" : "wrong not-knowing";
  return row.truth === "number" && reading.value === row.value ? "right" : "wrong answer";
}

const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
for (const which of ["legacy", "clef"] as const) {
  const counts: Record<string, number> = {};
  rows.forEach((row, at) => { const outcome = score(answers[at][which], row); counts[outcome] = (counts[outcome] ?? 0) + 1; });
  const ms = median(answers.map((a) => (which === "legacy" ? a.legacyMs : a.clefMs)).filter((v) => v > 0));
  console.log(`${which.padEnd(7)} right ${counts["right"] ?? 0}/${rows.length} | wrong answer ${counts["wrong answer"] ?? 0} | wrong not-knowing ${counts["wrong not-knowing"] ?? 0} | asked again ${counts["asked again"] ?? 0} | no answer ${counts["no answer"] ?? 0} | median ${ms} ms`);
}
for (const truth of ["number", "dont_know", "unclear"]) {
  const subset = rows.map((row, at) => ({ row, at })).filter(({ row }) => row.truth === truth);
  const right = (which: "legacy" | "clef") => subset.filter(({ row, at }) => score(answers[at][which], row) === "right").length;
  console.log(`  ${truth.padEnd(10)} n=${String(subset.length).padStart(2)}  legacy right ${right("legacy")}  clef right ${right("clef")}`);
}
