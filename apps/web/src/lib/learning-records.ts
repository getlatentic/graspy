import type { LearningSession } from "@/lib/curriculum-record";
import type { TopicRef } from "@/lib/learner-record";

// What this device kept before the server kept the learner's record.

interface LessonSlide {
  slideType:
    | "concept_introduction"
    | "worked_example"
    | "scaffolded_problem"
    | "misconception"
    | "synthesis";
  title: string;
  bodyMd: string;
  assessment?: {
    type: "choice" | "reflection" | "open";
    prompt: string;
    options?: string[];
    answerIndex?: number;
    explanation?: string;
    correctFeedback?: string;
    incorrectFeedback?: string;
  };
}

export interface LessonContentPayload {
  title: string;
  content: string;
  keyPoints: string[];
  slides: LessonSlide[];
  examples: string[];
  practice: {
    question: string;
    options: string[];
    answerIndex: number;
    correctFeedback: string;
    incorrectFeedback: string;
  };
  progress: {
    current: number;
    total: number;
  };
}

export interface StoredLesson extends TopicRef {
  lesson: LessonContentPayload;
  session: LearningSession;
  savedAt: number;
  lessonId?: string;
}

export interface LearntTopic extends TopicRef {
  learntAt: number;
}

// Keyed by message and question: a card asks several.
export interface PracticeRecord {
  messageId: string;
  planId: string;
  subjectSlug?: string;
  topic?: string;
  question: string;
  correct: boolean;
  answeredAt: number;
}
