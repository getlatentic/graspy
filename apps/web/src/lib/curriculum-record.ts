import type { Names } from "./education-api";

export interface CurriculumData {
  id: string;
  // Changes only when the plan is made again.
  planId: string;
  country: string;
  countryName?: string;
  language: string;
  languageName?: string;
  gradeLevel: string;
  // The learner's details as their profile keeps them; plans from earlier versions lack them.
  countryCode?: string;
  languageCode?: string;
  system?: string;
  level?: string;
  levelNames?: Names | null;
  course?: string;
  subjects: CurriculumSubject[];
  topics?: Record<string, string[]>;
  // Path topics' levels by subject slug, then topic; others are at gradeLevel.
  levels?: Record<string, Record<string, string>>;
  // By path subject slug: the topic the learner asked to learn.
  goals?: Record<string, string>;
  activeSession?: LearningSession;
  assessment?: {
    nextSubject: string | null;
  };
  createdAt: number;
  updatedAt: number;
}

export interface LearningSession {
  subject: string;
  topic: string;
  topicIndex: number;
  phase: "explanation" | "practice" | "feedback" | "complete";
}

export interface CurriculumSubject {
  name: string;
  slug: string;
}

export function topicsOf(
  curriculum: CurriculumData | null,
  subjectSlug: string,
): string[] {
  return curriculum?.topics?.[subjectSlug] ?? [];
}

export function planIdFor(createdAt: number): string {
  return `plan-${createdAt}`;
}
