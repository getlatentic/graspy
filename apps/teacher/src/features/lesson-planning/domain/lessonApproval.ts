import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import type { TeachingSlot } from "../../class-timetable/domain/classTimetable";
import type {
  LessonPlanExportInput,
  LessonPlanIdentity,
} from "../../document-export/domain/documentExport";
import { splitAssignment } from "../../academic-workspace/ui/assignmentLabel";
import type { LessonDraft } from "./lessonPlanning";

/**
 * A lesson as the plan document a school reads.
 *
 * The sections are the sections of that paper, under the names printed on it:
 * what graspy calls learning goals is Objectives there, what it calls instructional materials
 * is the instructional materials a teacher carries in, and how learning is
 * checked is Evaluation. Naming them here rather than at the renderer is what
 * keeps the document's shape a decision about the paperwork.
 */
export function planExportInput(
  lesson: LessonDraft,
  weekOrdinal: number | null,
  academicContext: ActiveAcademicContext,
  timetable: readonly TeachingSlot[] = [],
): LessonPlanExportInput {
  return {
    eyebrow: lesson.subtopic ? lesson.topic : "Lesson",
    title: lesson.subtopic ?? lesson.topic,
    subtitle:
      [lesson.subtopic, weekOrdinal ? `Week ${weekOrdinal}` : null].filter(Boolean).join(" · ") ||
      academicContext.assignment.displayName,
    identity: planIdentity(lesson, weekOrdinal, academicContext, timetable),
    objectives: lesson.learningGoals,
    instructionalMaterials: lesson.instructionalMaterials,
    previousKnowledge: lesson.previousKnowledge,
    steps: lesson.steps.map((step) => ({
      title: step.title,
      teacherActivity: step.teacherActivity,
      learnerActivity: step.learnerActivity,
      durationMinutes: step.durationMinutes,
    })),
    evaluation: lesson.assessment,
    assignment: lesson.assignment,
    references: lesson.references,
  };
}

/**
 * Which lesson this is, as the top of the plan states it.
 *
 * The period is the slot on a school timetable, not graspy's own period, which
 * means the term. It comes from the class's timetable; a class whose timetable
 * has not been set leaves the line blank for the teacher to write rather than
 * putting the term where the period belongs.
 */
function planIdentity(
  lesson: LessonDraft,
  weekOrdinal: number | null,
  { assignment }: ActiveAcademicContext,
  timetable: readonly TeachingSlot[],
): LessonPlanIdentity {
  return {
    week: weekOrdinal ? `${weekOrdinal}` : null,
    className: splitAssignment(assignment.displayName).classLabel,
    subject: assignment.subject,
    period: taughtPeriods(timetable),
    duration: lessonDuration(lesson),
  };
}

/**
 * The periods this class is taught in, as the plan's Period line states them.
 *
 * A week's plan is taught across every period the class has that week, so all
 * of them belong on the line rather than only the first.
 */
function taughtPeriods(timetable: readonly TeachingSlot[]): string | null {
  const periods = [...new Set(timetable.map(({ period }) => period))].sort((a, b) => a - b);
  return periods.length > 0 ? periods.join(", ") : null;
}

/** How long the lesson runs, when its steps say. */
function lessonDuration(lesson: LessonDraft): string | null {
  const minutes = lesson.steps.reduce((total, step) => total + (step.durationMinutes ?? 0), 0);
  return minutes > 0 ? `${minutes} minutes` : null;
}

/** A file name a teacher can find again in a folder of them. */
export function planFileName(lesson: LessonDraft): string {
  const base = (lesson.subtopic ?? lesson.topic)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "lesson"}-plan.pdf`;
}
