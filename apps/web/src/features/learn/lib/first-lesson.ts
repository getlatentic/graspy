import type {
  CurriculumData,
  CurriculumSubject,
  LearningSession,
} from "@/lib/curriculum-record";
import { lessonMade, lessonTarget } from "./lesson-app";

/** Made while the plan builds so the first tap opens a ready lesson; a failure fails the plan. */
export async function prepareFirstLesson(
  plan: CurriculumData,
  subject: CurriculumSubject,
): Promise<LearningSession | undefined> {
  const target = lessonTarget(plan, subject, 0);
  if (!target) return undefined;
  await lessonMade(target);
  return {
    subject: target.subject,
    topic: target.topic,
    topicIndex: 0,
    phase: "explanation",
  };
}
