import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Run, Turn } from "./turn-log.ts";

/** What a reader needs to know about a lesson to judge how it is taught. */
export interface PlanFacts {
  subject: string;
  topic: string;
  title: string;
  term: number | null;
  week: number | null;
  strand: string | null;
  objective: string | null;
}

const PLANS = fileURLToPath(new URL("../../server/src/app/voice/lesson_plans/plans/", import.meta.url));

/** The lesson plan an id names, read from the plan files the app is built from, or null when there is none. */
export function planFacts(planId: string): PlanFacts | null {
  const [subject, topic, lesson] = planId.split(".");
  const file = `${PLANS}${subject}/${topic}/${lesson}.json`;
  if (!existsSync(file)) return null;
  const plan = JSON.parse(readFileSync(file, "utf8"));
  return {
    subject, topic, title: plan.title.en, term: plan.term ?? null, week: plan.week ?? null,
    strand: plan.curriculum?.strand ?? null, objective: plan.curriculum?.objective ?? null,
  };
}

const BANDS: Record<string, string> = { early: "ages 3 to 5", lower: "ages 6 to 8", upper: "ages 9 to 11", junior: "ages 11 to 14" };

/** "primary_4" as "Primary 4, ages 9 to 11". */
export function learnerLevel(learnerClass: string): string {
  const [stage, number] = learnerClass.split("_");
  const name = [stage[0].toUpperCase() + stage.slice(1), number].filter(Boolean).join(" ").replace("Jss", "JSS");
  const band = stage === "primary" ? (Number(number) <= 3 ? BANDS.lower : BANDS.upper) : stage === "jss" ? BANDS.junior : BANDS.early;
  return `${name}, ${band}`;
}

const title = (word: string) => word.replace(/-/g, " ").replace(/^./, (letter) => letter.toUpperCase());

function heading(planId: string, facts: PlanFacts | null): string[] {
  if (facts === null) return [`## Lesson: ${planId}`];
  const scheme = facts.term === null ? "" : ` (term ${facts.term}, week ${facts.week})`;
  return [
    `## ${facts.title}`,
    `- **Subject:** ${title(facts.subject)}`,
    `- **Topic:** ${title(facts.topic)}${scheme}`,
    ...(facts.strand === null ? [] : [`- **Curriculum strand:** ${facts.strand}`]),
    ...(facts.objective === null ? [] : [`- **What the lesson is for:** ${facts.objective}`]),
  ];
}

function lines(turn: Turn): string[] {
  const { move, child, marking } = turn;
  const out = [`Teacher: ${move.says}  _[${move.kind === "rest" ? "rest" : move.event}]_`];
  if (child) {
    const heard = marking && marking.heard !== child.said ? `  [heard: ${marking.heard}]` : "";
    out.push(`Student: ${child.said === null ? "(says nothing)" : child.said}${heard}`);
  }
  if (marking) out.push(`Teacher: ${marking.feedback}  _[${marking.decision}]_`);
  if (turn.pageNote) out.push(`Teacher: (${turn.pageNote})  _[app note]_`);
  return out;
}

function recognisers(run: Run): string {
  const counts = new Map<string, number>();
  for (const turn of run.turns) if (turn.marking) counts.set(turn.marking.provider, (counts.get(turn.marking.provider) ?? 0) + 1);
  return [...counts].map(([provider, count]) => `${provider} (${count})`).join(", ") || "none: nothing was said";
}

/**
 * Everything said in a run, one line each, as Teacher and Student: the page to read to judge how a lesson
 * sounds. A run that goes on into another lesson gets that lesson's own heading.
 */
export function lessonScript(run: Run, facts: (planId: string) => PlanFacts | null = planFacts): string {
  const out = [
    `# Lesson script: ${run.persona} child, ${run.learnerClass}, ${run.language}`,
    `- **Learner:** ${learnerLevel(run.learnerClass)}; a simulated child ("${run.persona}"), voiced by ${run.voice.engine}`,
    `- **Lesson language:** ${run.language}`,
    `- **Date:** ${run.startedAt}${run.site ? `; app: ${run.site}` : ""}`,
    `- **Teacher lines:** written in the lesson plans, and replies the tutor model writes about each answer`,
    `- **Answers heard by:** ${recognisers(run)}`,
    `- **Ended:** ${run.finished}, after ${run.turns.length} turns`,
  ];
  let current: string | null = null;
  for (const turn of run.turns) {
    const planId = turn.move.planId;
    if (planId !== null && planId !== current) {
      current = planId;
      out.push("", ...heading(planId, facts(planId)), "");
    }
    out.push(...lines(turn));
  }
  return `${out.join("\n")}\n`;
}
