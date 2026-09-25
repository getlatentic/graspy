import type { PracticeQuestion } from "@/lib/content";
import { fill, type PracticeWords, type Words } from "./words";

/** The option chosen for each question, by position. */
export type Chosen = Record<number, number>;

export interface Score {
  right: number;
  total: number;
  chosen: Chosen;
}

export function scoreOf(questions: PracticeQuestion[], chosen: Chosen): Score {
  const right = questions.filter(
    (question, index) => chosen[index] === question.answerIndex,
  ).length;
  return { right, total: questions.length, chosen };
}

export const counts = ({ right, total }: Score) => ({
  right: String(right),
  total: String(total),
});

const answered = (question: PracticeQuestion, chosen: number) => ({
  question: question.question,
  chosen: question.options[chosen],
  answer: question.options[question.answerIndex],
});

export function askExplain(
  questions: PracticeQuestion[],
  chosen: Chosen,
  words: PracticeWords,
): string {
  if (questions.length === 1) {
    return fill(words.askExplain, answered(questions[0], chosen[0]));
  }
  const lines = questions.flatMap((question, index) =>
    chosen[index] === question.answerIndex
      ? []
      : [fill(words.wrongLine, answered(question, chosen[index]))],
  );
  return [words.askExplainWrong, ...lines].join("\n");
}

export function askAnotherPractice(
  [only]: PracticeQuestion[],
  score: Score,
  words: PracticeWords,
): string {
  if (score.total > 1) return fill(words.askAnotherSet, counts(score));
  return score.right === 1
    ? words.askAnotherRight
    : fill(words.askAnotherWrong, { chosen: only.options[score.chosen[0]] });
}

export function askAnotherPassage(score: Score, words: Words): string {
  return fill(words.passage.askAnother, counts(score));
}
