// Each tool's structured content, as the server's cards.py and
// lessons/tools.py shape it. It reaches a view from its host, so it is
// checked before it is shown.

export interface Where {
  planId?: string | null;
  subjectSlug?: string | null;
  topic?: string | null;
}

export interface ToolResult<C> {
  content: { type: "text"; text: string }[];
  structuredContent: C;
  _meta: {
    viewUUID: string;
    where?: Where | null;
  };
}

interface Choices {
  options: string[];
  answerIndex: number;
}

export interface PracticeQuestion extends Choices {
  question: string;
  correctFeedback: string;
  incorrectFeedback: string;
  hint: string;
}

export interface PracticeSet {
  instruction: string;
  questions: PracticeQuestion[];
}

export interface PassageSet {
  instruction: string;
  title: string;
  passage: string;
  questions: PracticeQuestion[];
}

const MAX_QUESTIONS = 5;

export const isText = (value: unknown): value is string =>
  typeof value === "string";

export function hasChoices<T extends Partial<Choices>>(
  value: T | null,
): value is T & Choices {
  const options = value?.options;
  const answer = value?.answerIndex;
  return (
    Array.isArray(options) &&
    options.length >= 2 &&
    options.every(isText) &&
    Number.isInteger(answer) &&
    answer! >= 0 &&
    answer! < options.length
  );
}

function isPractice(value: unknown): value is PracticeQuestion {
  const question = value as Partial<PracticeQuestion> | null;
  return (
    hasChoices(question) &&
    isText(question.question) &&
    isText(question.correctFeedback) &&
    isText(question.incorrectFeedback) &&
    isText(question.hint)
  );
}

function isQuestions(value: unknown): value is PracticeQuestion[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= MAX_QUESTIONS &&
    value.every(isPractice)
  );
}

export function isPracticeSet(value: unknown): value is PracticeSet {
  const set = value as Partial<PracticeSet> | null;
  return isText(set?.instruction) && isQuestions(set.questions);
}

export function isPassageSet(value: unknown): value is PassageSet {
  const set = value as Partial<PassageSet> | null;
  return (
    isText(set?.instruction) &&
    isText(set.title) &&
    isText(set.passage) &&
    set.passage.trim().length > 0 &&
    isQuestions(set.questions)
  );
}

// answer_practice's and answer_check's arguments (learner/answers.PracticeAnswer
// on the server). The key is the question's place in its view, so an answer
// sent again replaces the first on the learner's record.
export function practiceAnswer(
  question: Choices & { question: string },
  chosenIndex: number,
  where: Where | null | undefined,
  key: string,
) {
  return {
    question: question.question,
    options: question.options,
    answerIndex: question.answerIndex,
    chosenIndex,
    ...(where ? { where } : {}),
    key,
  };
}
