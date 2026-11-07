// What the observer read beside what the tutor did, by kind of turn, from a log of the tutor Worker.
//   npx wrangler tail graspy-tutor-staging --format json > tail.json     (let a batch of lessons run, then stop it)
//   node bench/shadow-report.ts tail.json [more.json ...]     (Node 24.2 or later: it runs only as the main module)
// Reads the `observer-shadow` lines only and prints counts and times: never a word a child said, even where the log has them.
import { readFileSync } from "node:fs";

export interface ShadowLine {
  decidedBy?: string;
  taken?: string | null;
  observer?: string | null;
  agree?: boolean | null;
  ms?: number | null;
}

/** Every JSON value in a text that holds them one after another, as a `wrangler tail` leaves them, or one to a line. */
export function jsonValues(text: string): unknown[] {
  const found: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (inString) {
      if (char === "\\") at += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = depth > 0;
    else if (char === "{" || char === "[") {
      if (depth === 0) start = at;
      depth += 1;
    } else if ((char === "}" || char === "]") && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        try {
          found.push(JSON.parse(text.slice(start, at + 1)));
        } catch {
          // Not JSON after all; the next value is looked for.
        }
      }
    }
  }
  return found;
}

/** The `observer-shadow` lines the Worker logged, from tail events (each holding its `logs`) or bare log lines. */
export function shadowLines(text: string): ShadowLine[] {
  const lines: ShadowLine[] = [];
  const take = (value: unknown) => {
    if (typeof value === "object" && value !== null && (value as { part?: unknown }).part === "observer-shadow") lines.push(value as ShadowLine);
  };
  for (const value of jsonValues(text)) {
    const logs = (value as { logs?: { message?: unknown[] }[] }).logs;
    if (!Array.isArray(logs)) take(value);
    else for (const log of logs) for (const message of log.message ?? []) if (typeof message === "string") jsonValues(message).forEach(take);
  }
  return lines;
}

const quantile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

/** Per kind of turn (who decided it): how many, how often the two agree, where they differ, how long the observer took. */
export function summary(lines: ShadowLine[]): string {
  const kinds = [...new Set(lines.map((line) => line.decidedBy ?? "router"))].sort();
  const out: string[] = [];
  for (const kind of kinds) {
    const own = lines.filter((line) => (line.decidedBy ?? "router") === kind);
    if (kind === "observer") {
      out.push(`observer: ${own.length} turns it decided itself (nothing to compare with)`);
      continue;
    }
    const answered = own.filter((line) => line.observer !== "none");
    const agreed = answered.filter((line) => line.agree).length;
    const times = answered.map((line) => line.ms ?? 0).sort((a, b) => a - b);
    out.push(`${kind}: ${own.length} turns | observer gave nothing ${own.length - answered.length} | agree ${agreed} of ${answered.length}${times.length > 0 ? ` | observer median ${quantile(times, 0.5)} ms, p90 ${quantile(times, 0.9)} ms` : ""}`);
    const differences = new Map<string, number>();
    for (const line of answered.filter((entry) => !entry.agree)) {
      const key = `${line.taken ?? "marking"} -> ${line.observer ?? "no action"}`;
      differences.set(key, (differences.get(key) ?? 0) + 1);
    }
    for (const [key, count] of [...differences].sort((a, b) => b[1] - a[1])) out.push(`    ${count} x tutor ${key.replace(" -> ", ", observer ")}`);
  }
  return out.length === 0 ? "no observer-shadow lines" : out.join("\n");
}

if ((import.meta as { main?: boolean }).main) {
  const files = process.argv.slice(2);
  if (files.length === 0) throw new Error("usage: node bench/shadow-report.ts <tail.json> [more.json ...]");
  console.log(summary(files.flatMap((file: string) => shadowLines(readFileSync(file, "utf8")))));
}
