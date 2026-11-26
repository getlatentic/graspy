// Each tool's structured content, as the server's cards.py and
// lessons/tools.py shape it. It reaches a view from its host, so it is
// checked before it is shown.

import type { LessonTarget } from "./lesson";

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

export interface ChoiceSet {
  question: string;
  options: string[];
}

/** The "About you" form: every country's classes, sent once each (cards.py's AboutYou). */
export interface AboutYou {
  /** The country code the form starts on; the learner confirms or changes it. */
  country: string | null;
  countries: string[];
  /** Each country's English name, as the catalogue writes it. */
  names: Record<string, string>;
  classLists: string[][];
  /** Which of `classLists` each country has. */
  classListOf: Record<string, number>;
  /** The classes that ask for a course. */
  afterSchool: string[];
}

/** One topic of a path, and the level it is taught at (cards.py's PathStep). */
export interface PathStep {
  title: string;
  level: string;
}

export interface PlannedPath {
  subject: string;
  goal: string;
  steps: PathStep[];
}

/** The courses the tutor proposes, each topic one the learner can leave out (cards.py's PathChoice). */
export interface PathChoice {
  paths: PlannedPath[];
}

/** A lesson made for a topic the learner added, and where it opens (cards.py's StartLesson). */
export interface StartLesson {
  topic: string;
  subject: string;
  status: "ready" | "making" | "failed";
  /** What give_lesson and lesson_progress are asked with: the lesson's own view reads it back. */
  target: LessonTarget;
  lessonId: string | null;
  openPath: string;
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

export function isChoiceSet(value: unknown): value is ChoiceSet {
  const set = value as Partial<ChoiceSet> | null;
  return (
    isText(set?.question) &&
    set.question.trim().length > 0 &&
    Array.isArray(set.options) &&
    set.options.length >= 2 &&
    set.options.every((option) => isText(option) && option.trim().length > 0)
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
  /** A lesson's check: its slide, and the wrong options chosen before this one. */
  check?: { slide: number; tried: number[] },
) {
  return {
    ...check,
    question: question.question,
    options: question.options,
    answerIndex: question.answerIndex,
    chosenIndex,
    ...(where ? { where } : {}),
    key,
  };
}

/** What a wrong answer to a lesson's check is given next, from answer_check's result. */
export interface Help {
  kind: "cue" | "narrow" | "told";
  /** The options still to choose from, named by "narrow" only. */
  keep: number[];
}

const HELP_KINDS = new Set<string>(["cue", "narrow", "told"]);

export function helpOf(value: unknown): Help | null {
  const help = (value as { help?: Partial<Help> } | null)?.help;
  if (!isText(help?.kind) || !HELP_KINDS.has(help.kind)) return null;
  return {
    kind: help.kind as Help["kind"],
    keep: Array.isArray(help.keep)
      ? help.keep.filter((index) => Number.isInteger(index))
      : [],
  };
}

const isTexts = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isText);

export function isAboutYou(value: unknown): value is AboutYou {
  const form = value as Partial<AboutYou> | null;
  const lists = form?.classLists;
  const listOf = form?.classListOf;
  const names = form?.names;
  return (
    (form?.country === null || isText(form?.country)) &&
    typeof names === "object" &&
    names !== null &&
    isTexts(form.countries) &&
    form.countries.length > 0 &&
    Array.isArray(lists) &&
    lists.every(isTexts) &&
    typeof listOf === "object" &&
    listOf !== null &&
    form.countries.every((code) => {
      const list = lists[listOf[code]];
      return isText(names[code]) && list !== undefined && list.length > 0;
    }) &&
    isTexts(form.afterSchool)
  );
}

function isStep(value: unknown): value is PathStep {
  const step = value as Partial<PathStep> | null;
  return isText(step?.title) && step.title.trim() !== "" && isText(step.level);
}

function isPlannedPath(value: unknown): value is PlannedPath {
  const path = value as Partial<PlannedPath> | null;
  return (
    isText(path?.subject) &&
    isText(path.goal) &&
    Array.isArray(path.steps) &&
    path.steps.length > 0 &&
    path.steps.every(isStep)
  );
}

export function isPathChoice(value: unknown): value is PathChoice {
  const choice = value as Partial<PathChoice> | null;
  return (
    Array.isArray(choice?.paths) &&
    choice.paths.length > 0 &&
    choice.paths.every(isPlannedPath)
  );
}

const LESSON_STATUSES = new Set<string>(["ready", "making", "failed"]);

export function isStartLesson(value: unknown): value is StartLesson {
  const start = value as Partial<StartLesson> | null;
  const target = start?.target as Partial<LessonTarget> | undefined;
  return (
    isText(start?.topic) &&
    isText(start.subject) &&
    isText(start.status) &&
    LESSON_STATUSES.has(start.status) &&
    isText(start.openPath) &&
    start.openPath.startsWith("/app/learn/") &&
    typeof target === "object" &&
    target !== null &&
    isText(target.topic)
  );
}
