import { assessmentPrompt, type LessonDraft } from "./lessonPlanning";

/** One check on a lesson: what is asked, and what a right answer looks like. */
export interface LessonCheck {
  readonly question: string;
  readonly objective: string | null;
  readonly answer: string | null;
  readonly rubric: readonly string[];
}

/**
 * The checks a lesson carries, question and expected answer both.
 *
 * A prepared lesson keeps the record it was built from, and that record holds
 * the answer and the marking points the flat lesson threw away — so when it is
 * there the checks are read from it. A lesson written by hand has the questions
 * and nothing behind them, and shows the question alone rather than an empty
 * answer that would read as an answer nobody wrote down.
 */
export function lessonChecks(lesson: LessonDraft): LessonCheck[] {
  const prepared = lesson.granularRecord?.plan.assessments ?? [];
  if (prepared.length) {
    return prepared.map((assessment) => {
      const { objective, question } = assessmentPrompt(assessment.question);
      return { question, objective, answer: assessment.expectedAnswer, rubric: assessment.rubric };
    });
  }
  return lesson.assessment.map((value) => {
    const { objective, question } = assessmentPrompt(value);
    return { question, objective, answer: null, rubric: [] };
  });
}
