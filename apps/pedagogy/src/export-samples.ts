import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { personaNamed } from "./personas.ts";
import { sampleOf, type SampleRecord } from "./samples.ts";
import type { Run } from "./turn-log.ts";
import { wavInfo } from "./wav-info.ts";

const CARD = `# graspy simulated-child recordings

Recordings of a **synthetic** child, played to graspy's voice lessons by the pedagogy test (apps/pedagogy in getlatentic/graspy), with the words intended, what graspy's speech recogniser heard, and how the teacher marked the answer.

- Every record has \`synthetic: true\`. The voice is a cloned voice (yarngo studio, dots.tts) pitched up: these are not children and not African-accented speakers. Do not add them to a dataset of real speakers, such as AfroMathVoices, without that flag and a separate split.
- Useful for: measuring how the recogniser mishears spoken numbers and counting (\`intended_text\` against \`recogniser.transcript\`), and for checking that marking copes with what the recogniser returns.
- Not useful for: training or evaluating a recogniser on real children or real accents.
- \`metadata.jsonl\` holds one record per recording; \`audio/\` holds mono 48 kHz 16-bit wav files named by \`sample_id\`.
- Licence and the provenance of the reference voice are not settled: see the owner before sharing.
`;

function options() {
  const { values } = parseArgs({
    options: { runs: { type: "string", default: "runs" }, dest: { type: "string" } },
  });
  if (!values.dest) throw new Error("Usage: node src/export-samples.ts --dest <folder> [--runs runs]");
  return { runs: resolve(values.runs as string), dest: resolve(values.dest) };
}

function known(metadata: string): Set<string> {
  if (!existsSync(metadata)) return new Set();
  return new Set(
    readFileSync(metadata, "utf8").split("\n").filter(Boolean).map((line) => (JSON.parse(line) as SampleRecord).sample_id),
  );
}

function samplesOf(runDir: string): { record: SampleRecord; source: string }[] {
  const { run } = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8")) as { run: Run };
  const spoken = personaNamed(run.persona).spoken;
  return run.turns.flatMap((turn) => {
    if (!turn.answerAudio) return [];
    const source = join(runDir, turn.answerAudio);
    const wav = readFileSync(source);
    const record = sampleOf(run, turn, wav, wavInfo(wav), `audio/${run.id}-t${String(turn.index).padStart(2, "0")}.wav`, spoken);
    return record ? [{ record, source }] : [];
  });
}

/** Adds every run's recordings to the folder, once each: running it again adds only the new ones. */
export function exportSamples(runs: string, dest: string): number {
  mkdirSync(join(dest, "audio"), { recursive: true });
  const metadata = join(dest, "metadata.jsonl");
  if (!existsSync(join(dest, "README.md"))) writeFileSync(join(dest, "README.md"), CARD);
  const have = known(metadata);
  let added = 0;
  for (const name of readdirSync(runs).filter((n) => existsSync(join(runs, n, "run.json")))) {
    for (const { record, source } of samplesOf(join(runs, name))) {
      if (have.has(record.sample_id)) continue;
      copyFileSync(source, join(dest, record.file_name));
      appendFileSync(metadata, `${JSON.stringify(record)}\n`);
      added++;
    }
  }
  return added;
}

if (import.meta.main) {
  const { runs, dest } = options();
  console.log(`${exportSamples(runs, dest)} recordings added to ${dest}`);
}
