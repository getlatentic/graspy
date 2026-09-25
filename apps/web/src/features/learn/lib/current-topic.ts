import {
  topicsOf,
  type CurriculumData,
  type CurriculumSubject,
  type LearningSession,
} from "@/lib/curriculum-record";
import { goalIndex } from "./curriculum-edit";

export interface CurrentTopic {
  subject: CurriculumSubject;
  topics: string[];
  topicIndex: number;
  topic: string;
  started: boolean;
}

/** Shared by home and the tutor so what they offer cannot disagree. */
export function currentTopic(
  curriculum: CurriculumData | null,
  nextSubject: CurriculumSubject | null,
): CurrentTopic | null {
  const subject =
    nextSubject ?? sessionSubject(curriculum) ?? curriculum?.subjects[0];
  if (!subject) return null;

  const topics = topicsOf(curriculum, subject.slug);
  const session = sessionIn(curriculum?.activeSession, subject, topics);
  const topicIndex = session?.topicIndex ?? startOf(curriculum, subject);
  const topic = topics[topicIndex];
  if (!topic) return null;

  return {
    subject,
    topics,
    topicIndex,
    topic,
    started: session !== null && session.phase !== "complete",
  };
}

/** A path starts at its goal, not the first step to it. */
function startOf(
  curriculum: CurriculumData | null,
  subject: CurriculumSubject,
): number {
  return Math.max(0, goalIndex(curriculum, subject.slug));
}

function sessionSubject(
  curriculum: CurriculumData | null,
): CurriculumSubject | null {
  const name = curriculum?.activeSession?.subject;
  if (!curriculum || !name) return null;
  return curriculum.subjects.find((subject) => subject.name === name) ?? null;
}

function sessionIn(
  session: LearningSession | undefined,
  subject: CurriculumSubject,
  topics: string[],
): LearningSession | null {
  if (session?.subject !== subject.name) return null;
  if (typeof session.topicIndex !== "number") return null;
  return topics[session.topicIndex] ? session : null;
}
