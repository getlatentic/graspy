import { lessonContentFromGranularPlan } from "./lessonContentFromGranular";
import { taughtStepFromActivities, taughtSteps, type LessonTaughtStep } from "./lessonTaught";
import type { LessonContent } from "./lessonContent";
import type { LessonDraft } from "./lessonPlanning";
import type { StudentNoteJob } from "../application/LessonNoteGenerator";

/**
 * The lesson content the student note is written from: the plan's own taught
 * words when the lesson has them — a prepared lesson always does, an authored
 * one when written — and the bare activity shape only when it has nothing
 * richer. The signatures hold the model to stating nothing beyond it.
 */
function taughtContent(lesson: LessonDraft): LessonContent | null {
  if (lesson.granularRecord) return lessonContentFromGranularPlan(lesson.granularRecord.plan);
  return lesson.authoredContent ?? null;
}

function taughtLessonSteps(lesson: LessonDraft): readonly LessonTaughtStep[] {
  const content = taughtContent(lesson);
  return content ? taughtSteps(content) : lesson.steps.map(taughtStepFromActivities);
}

/** What the note is written from, gathered from the lesson it belongs to. */
export function noteJob(lesson: LessonDraft): StudentNoteJob {
  return {
    context: {
      academicSessionId: lesson.academicSessionId,
      academicPeriodId: lesson.academicPeriodId,
      teachingAssignmentId: lesson.teachingAssignmentId,
    },
    lessonId: lesson.id,
    writtenFromVersion: lesson.latestVersionNumber,
    topic: lesson.topic,
    subtopic: lesson.subtopic,
    learningGoals: lesson.learningGoals,
    steps: taughtLessonSteps(lesson),
  };
}
