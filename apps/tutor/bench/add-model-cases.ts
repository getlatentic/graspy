// Asks gpt-oss-120b (through the bench Worker's /generate) for the cases of each spec in model-cases.ts and appends them.
// A request whose ids are already in the file is not asked again, so a rerun adds nothing and an id never changes meaning.
//   npx wrangler dev --config bench/wrangler.jsonc --port 8799   (with AWS_BEARER_TOKEN_BEDROCK in bench/.dev.vars)
//   node bench/add-model-cases.ts [http://localhost:8799]
import { appendRows, loadSet, sameWords, type Row } from "./observation-set.ts";
import { PER_REQUEST, SPECS, SYSTEM, linesOf, requestFor } from "./model-cases.ts";
import { PROMPTS, saysNumber } from "./template-cases.ts";

const URL_ = process.argv[2] ?? "http://localhost:8799";
const have = loadSet();
const ids = new Set(have.map((row) => row.id));
const texts = new Set(have.map(sameWords));
let added = 0;

async function ask(system: string, user: string): Promise<string> {
  const reply = (await (await fetch(`${URL_}/generate`, { method: "POST", body: JSON.stringify({ system, user }) })).json()) as { text: string | null };
  return reply.text ?? "";
}

for (const [specAt, spec] of SPECS.entries()) {
  for (let request = 0; request < spec.requests; request += 1) {
    const stem = `gen.${spec.key}.${request}`;
    if ([...ids].some((id) => id.startsWith(`${stem}.`))) continue;
    const { prompt, expected } = PROMPTS[(specAt * 5 + request * 7) % PROMPTS.length];
    const lines = linesOf(await ask(SYSTEM, requestFor(spec, prompt, expected)), spec.says);
    const fresh: Row[] = [];
    lines.slice(0, PER_REQUEST + 2).forEach(({ heard, number }, at) => {
      // A line that has to say its number but does not (apart from a number the recogniser mangled) is left out; its position still counts, so ids stay stable.
      if (number !== null && spec.key !== "answer-misheard" && !saysNumber(heard, number)) return;
      const row: Row = { id: `${stem}.${at}`, source: "gpt-oss-120b", heard, prompt, expected, labels: spec.labels(number) };
      if (texts.has(sameWords(row))) return;
      texts.add(sameWords(row));
      fresh.push(row);
    });
    appendRows(fresh);
    fresh.forEach((row) => ids.add(row.id));
    added += fresh.length;
    console.log(`${stem}: ${fresh.length} of ${lines.length}`);
  }
}
console.log(`${added} model cases added`);
