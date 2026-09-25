import type { LessonContent } from "./lessonContent";

/**
 * A teaching step reduced to the words that teach: what is explained, the
 * worked examples with their values and answers, and the practice set.
 *
 * The note and the pack are written from this, so everything they may state is
 * something the plan itself states — a model given only activity lines has to
 * invent the content, and a 2B model invents it wrongly.
 */
export interface LessonTaughtStep {
  readonly title: string;
  readonly summary: string;
  readonly taught: readonly string[];
  readonly workedExamples: readonly string[];
  readonly practice: readonly string[];
}

/** A check the plan already asks, with the answer it expects. */
export interface LessonCheckSummary {
  readonly question: string;
  readonly expectedAnswer: string;
}

export function taughtSteps(content: LessonContent): readonly LessonTaughtStep[] {
  return content.steps.map((step) => ({
    title: step.title,
    summary: step.summary,
    taught: step.blocks
      .filter((block) => block.type === "explanation")
      .map((block) => block.content)
      .filter(present),
    workedExamples: step.blocks
      .filter((block) => block.type === "worked_example")
      .map((block) =>
        [
          block.problem,
          ...block.steps.map((line) => (line.label ? `${line.label}: ${line.content}` : line.content)),
          block.finalAnswer ? `Answer: ${block.finalAnswer}` : "",
        ]
          .filter(present)
          .join("\n"),
      )
      .filter(present),
    practice: step.blocks
      .filter((block) => block.type === "practice")
      .map((block) =>
        [block.question, block.expectedAnswer ? `Answer: ${block.expectedAnswer}` : ""]
          .filter(present)
          .join("\n"),
      )
      .filter(present),
  }));
}

export function taughtChecks(content: LessonContent): readonly LessonCheckSummary[] {
  return content.checks
    .filter((check) => present(check.question))
    .map((check) => ({ question: check.question, expectedAnswer: check.expectedAnswer }));
}

/**
 * The reduction for a lesson that has only activity lines — typed by hand with
 * no prepared or authored content behind it. The model then knows the shape of
 * the teaching but none of its facts, and the signature instructions hold it to
 * stating nothing the plan does not.
 */
export function taughtStepFromActivities(step: {
  readonly title: string;
  readonly teacherActivity: string;
  readonly learnerActivity: string;
}): LessonTaughtStep {
  return {
    title: step.title,
    summary: [step.teacherActivity, step.learnerActivity].filter(present).join(" "),
    taught: [],
    workedExamples: [],
    practice: [],
  };
}

function present(text: string): boolean {
  return text.trim().length > 0;
}
