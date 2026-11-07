// Whether starting the observer beside the router's second request shortens the slow turns, on bench/routing.jsonl.
// Each case is sent to both arms, alternating, `ROUNDS` times: "router" is today's turn (the router alone, with its own
// second request) and "hedged" is the router with the observer started beside that second request (src/hedge-route.ts).
// The cases are asked one at a time so the arms see the same host; slow calls are a few in a hundred, so many rounds.
//   AWS_BEARER_TOKEN_BEDROCK in bench/.dev.vars; npx wrangler dev --config bench/wrangler.jsonc --port 8799
//   node bench/run-hedge.ts [http://localhost:8799] [rounds]
import { readFileSync } from "node:fs";

const URL_ = process.argv[2] ?? "http://localhost:8799";
const ROUNDS = Number(process.argv[3] ?? 5);
const PROMPT = "One heap has five oranges. How many oranges are in two heaps?";
const rows = readFileSync(new URL("./routing.jsonl", import.meta.url).pathname, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { heard: string });
type Arm = "router" | "hedged";
interface Result { ms: number; observerAsked: boolean; by: string; action: string | null }
const results: Record<Arm, Result[]> = { router: [], hedged: [] };
const agree = { same: 0, different: 0 };

for (let round = 0; round < ROUNDS; round += 1) {
  for (const row of rows) {
    const pair = {} as Record<Arm, Result>;
    for (const arm of (round % 2 === 0 ? ["router", "hedged"] : ["hedged", "router"]) as Arm[]) {
      pair[arm] = (await (await fetch(URL_ + "/hedge", { method: "POST", body: JSON.stringify({ heard: row.heard, prompt: PROMPT, arm }) })).json()) as Result;
      results[arm].push(pair[arm]);
    }
    if (pair.router.action === pair.hedged.action) agree.same += 1;
    else agree.different += 1;
  }
}

const at = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
for (const arm of ["router", "hedged"] as Arm[]) {
  const ms = results[arm].map((r) => r.ms).sort((a, b) => a - b);
  const slow = (limit: number) => ms.filter((v) => v > limit).length;
  const asked = results[arm].filter((r) => r.observerAsked).length;
  const byObserver = results[arm].filter((r) => r.by === "observer").length;
  const none = results[arm].filter((r) => r.by === "none").length;
  console.log(`${arm.padEnd(7)} n=${ms.length} median ${at(ms, 0.5)} p90 ${at(ms, 0.9)} p99 ${at(ms, 0.99)} max ${ms.at(-1)} ms | over 2 s ${slow(2000)} over 3 s ${slow(3000)} | observer asked ${asked} (answered ${byObserver}) | no action ${none}`);
}
console.log(`same action in both arms: ${agree.same} of ${agree.same + agree.different}`);
