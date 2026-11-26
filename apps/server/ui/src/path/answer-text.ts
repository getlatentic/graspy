import type { PlannedPath } from "@/lib/content";

/** The first line of the answer, which the server reads back (agent/path_answer.py). */
export const ANSWER_HEAD = "Add to my plan:";

/** What the learner may say is missing or wrong, at most (agent/path_card.py's MAX_CHANGES). */
export const MAX_CHANGES = 300;

/** A topic by its course and its place in it. */
export const stepKey = (path: number, step: number) => `${path}:${step}`;

/** The answer: each course with a topic kept, and the topics kept, one to a line, each with its
 * level. The server reads the same words whatever language the card is shown in. */
export function answerText(
  paths: PlannedPath[],
  off: ReadonlySet<string>,
): string {
  const lines = [ANSWER_HEAD];
  paths.forEach((path, at) => {
    const kept = path.steps.filter((_, step) => !off.has(stepKey(at, step)));
    if (kept.length === 0) return;
    lines.push(`Course: ${path.subject}`);
    for (const step of kept) lines.push(`- ${step.title} | ${step.level}`);
  });
  return lines.join("\n");
}
