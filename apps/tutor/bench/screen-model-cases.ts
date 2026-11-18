// A blind second reading of the cases gpt-oss-120b wrote: the same model is given each case's words and question, none of the
// label or the brief, and says what the child communicated. The cases where it differs from the label are the ones a person
// reads first (a person also reads a sample of the cases it agreed with, to see how many wrong labels it lets through).
//   node bench/screen-model-cases.ts [http://localhost:8799] [out.json]
import { writeFileSync } from "node:fs";
import { loadSet, type Row } from "./observation-set.ts";
import { READER_SYSTEM, differences, readerRequest, readings } from "./model-cases.ts";

const URL_ = process.argv[2] ?? "http://localhost:8799";
const OUT = process.argv[3] ?? "screen.json";
const BATCH = 12;

const written = loadSet().filter((row) => row.source === "gpt-oss-120b" && row.review === undefined);
const byQuestion = Map.groupBy(written, (row) => row.prompt);
const checked: { id: string; heard: string; differs: string[] }[] = [];

for (const [prompt, rows] of byQuestion) {
  for (let from = 0; from < rows.length; from += BATCH) {
    const batch: Row[] = rows.slice(from, from + BATCH);
    const reply = (await (await fetch(`${URL_}/generate`, { method: "POST", body: JSON.stringify({ system: READER_SYSTEM, user: readerRequest(prompt, batch.map((row) => row.heard)) }) })).json()) as { text: string | null };
    const read = readings(reply.text ?? "");
    batch.forEach((row, at) => {
      const mine = read.find((r) => r.n === at + 1);
      checked.push({ id: row.id, heard: row.heard, differs: mine === undefined ? ["no reading"] : differences(row.labels, mine) });
    });
  }
}
writeFileSync(OUT, JSON.stringify(checked, null, 1));
const differing = checked.filter((c) => c.differs.length > 0);
console.log(`${checked.length} cases read blind; ${differing.length} differ from their labels (${Math.round((100 * differing.length) / checked.length)}%)`);
