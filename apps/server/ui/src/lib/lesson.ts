// give_lesson's and lesson_progress's structured content, as the server's
// lessons/tools.py shapes it. The lesson is the model's writing and arrives
// slide by slide, so a slide or a check that does not read as one is left out
// rather than failing the lesson.

import { hasChoices, isText, type Where } from "./content";

export interface LessonCheck {
  prompt: string;
  options: string[];
  answerIndex: number;
  correctFeedback: string;
  incorrectFeedback: string;
}

export interface LessonSlide {
  slideType: string;
  title: string;
  bodyMd: string;
  assessment: LessonCheck | null;
}

interface Lesson {
  title: string;
  objectives: string[];
  slides: LessonSlide[];
}

export interface LessonTarget {
  planId: string;
  subjectSlug: string;
  subject: string;
  topicIndex: number;
  topic: string;
  totalTopics: number;
  country: string;
  language: string;
  gradeLevel?: string | null;
}

type LessonStatus = "making" | "ready" | "failed";

export interface LessonView {
  status: LessonStatus;
  lesson: Lesson | null;
  /** Finished without losing a slide on the way. */
  whole: boolean;
  attempt: number;
  target: LessonTarget;
}

const STATUSES = new Set<string>(["making", "ready", "failed"]);

const textOr = (value: unknown) => (isText(value) ? value : "");

function checkOf(value: unknown): LessonCheck | null {
  const check = value as Partial<LessonCheck> | null;
  if (!hasChoices(check) || !isText(check.prompt)) return null;
  return {
    prompt: check.prompt,
    options: check.options,
    answerIndex: check.answerIndex,
    correctFeedback: textOr(check.correctFeedback),
    incorrectFeedback: textOr(check.incorrectFeedback),
  };
}

function slideOf(value: unknown): LessonSlide | null {
  const slide = value as Partial<LessonSlide> | null;
  if (!isText(slide?.title) || !isText(slide.bodyMd)) return null;
  return {
    slideType: textOr(slide.slideType),
    title: slide.title,
    bodyMd: slide.bodyMd,
    assessment: checkOf(slide.assessment),
  };
}

function lessonOf(value: unknown): Lesson | null {
  const lesson = value as {
    title?: unknown;
    objectives?: unknown;
    slides?: unknown;
  } | null;
  if (!isText(lesson?.title) || !Array.isArray(lesson.slides)) return null;
  return {
    title: lesson.title,
    objectives: Array.isArray(lesson.objectives)
      ? lesson.objectives.filter(isText)
      : [],
    slides: lesson.slides.flatMap((slide) => slideOf(slide) ?? []),
  };
}

function isTarget(value: unknown): value is LessonTarget {
  const target = value as Partial<LessonTarget> | null;
  return (
    isText(target?.planId) &&
    isText(target.subjectSlug) &&
    isText(target.subject) &&
    isText(target.topic) &&
    Number.isInteger(target.topicIndex) &&
    Number.isInteger(target.totalTopics)
  );
}

export function lessonViewOf(value: unknown): LessonView | null {
  const view = value as Partial<LessonView> | null;
  if (!isText(view?.status) || !STATUSES.has(view.status)) return null;
  if (!isTarget(view.target)) return null;
  return {
    status: view.status,
    lesson: lessonOf(view.lesson),
    whole: view.whole === true,
    attempt: Number.isInteger(view.attempt) ? view.attempt! : 0,
    target: view.target,
  };
}

/** finish_lesson's arguments. */
export function topicOf(target: LessonTarget) {
  return {
    planId: target.planId,
    subjectSlug: target.subjectSlug,
    topicIndex: target.topicIndex,
    topic: target.topic,
  };
}

export function whereOf(target: LessonTarget): Where {
  return {
    planId: target.planId,
    subjectSlug: target.subjectSlug,
    topic: target.topic,
  };
}
