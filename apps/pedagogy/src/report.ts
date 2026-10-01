import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Finding } from "./checks.ts";
import type { Judgement } from "./judge.ts";
import type { Run, Turn } from "./turn-log.ts";
import { lessonScript } from "./script.ts";
import { speechSummary } from "./speech-timing.ts";
import { hearingFidelity } from "./words.ts";

/** How faithfully the recogniser heard the child across a run, or null if nothing was said. */
export function meanFidelity(run: Run): number | null {
  const scores = run.turns.flatMap((turn) =>
    turn.child?.said && turn.marking ? [hearingFidelity(turn.child.said, turn.marking.heard)] : [],
  );
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}

function turnSection(turn: Turn): string {
  const { move, child, marking } = turn;
  const lines = [`### Turn ${turn.index}: ${move.event ?? move.kind}${move.planId ? ` (${move.planId})` : ""}`];
  lines.push(`**Teacher:** ${move.says}${move.shows ? `  \n*On screen:* ${move.shows}` : ""}`);
  if (child) {
    const verdict = child.isRight === null ? "" : child.isRight ? " (right)" : " (wrong)";
    lines.push(`**Child, meaning to say:** ${child.said === null ? "*nothing*" : `"${child.said}"`}${verdict}  \n*Why:* ${child.note}`);
  }
  if (marking) {
    lines.push(`**Recogniser heard:** "${marking.heard}"${marking.parsedAnswer === null ? "" : ` → ${marking.parsedAnswer}`}`);
    lines.push(`**Teacher marks:** ${marking.decision}: "${marking.feedback}" *(${marking.provider}, ${marking.latencyMs} ms)*`);
  }
  if (turn.pageNote) lines.push(`**Page note:** ${turn.pageNote}`);
  if (turn.screenshots.length) lines.push(turn.screenshots.map((shot) => `![turn ${turn.index}](${shot})`).join(" "));
  return lines.join("\n\n");
}

function findingsSection(findings: Finding[]): string {
  if (!findings.length) return "None.";
  return findings
    .map((found) => `- **${found.severity}** \`${found.check}\`${found.turn === null ? "" : ` (turn ${found.turn})`}: ${found.detail}`)
    .join("\n");
}

function judgementSection(judgement: Judgement | null): string {
  if (!judgement) return "Not run.";
  const rows = judgement.scores.map((row) => `| ${row.criterion} | ${row.score} | ${row.evidence.replace(/\|/g, "/")} |`);
  return [`${judgement.summary}`, "", "| Criterion | 1-5 | Evidence |", "|---|---|---|", ...rows].join("\n");
}

export function transcriptMarkdown(run: Run, findings: Finding[], judgement: Judgement | null): string {
  const fidelity = meanFidelity(run);
  return [
    `# Pedagogy run: ${run.persona}, ${run.learnerClass}, ${run.language}`,
    `Started ${run.startedAt}. Ended: ${run.finished}, after ${run.turns.length} turns.${run.plan ? ` Lesson: ${run.plan}.` : ""}`,
    `Recogniser fidelity to what the child meant to say: ${fidelity === null ? "n/a" : fidelity.toFixed(2)}.`,
    "## Mechanical findings",
    findingsSection(findings),
    "## Speech timing",
    run.audio ? speechSummary(run) : "Not measured.",
    "## Judge (a non-Anthropic model reading the transcript)",
    judgementSection(judgement),
    "## Transcript",
    ...run.turns.map(turnSection),
  ].join("\n\n");
}

export function writeRun(dir: string, run: Run, findings: Finding[], judgement: Judgement | null): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "transcript.md"), transcriptMarkdown(run, findings, judgement));
  writeFileSync(join(dir, "script.md"), lessonScript(run));
  writeFileSync(join(dir, "run.json"), JSON.stringify({ run, findings, judgement }, null, 2));
}
