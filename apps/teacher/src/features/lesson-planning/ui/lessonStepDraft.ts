import type { LessonStepInput } from "../domain/lessonPlanning";

export interface EditableStep {
  readonly title: string;
  readonly teacherActivity: string;
  readonly learnerActivity: string;
  readonly durationMinutes: string;
}

export function isStartedStep(step: EditableStep) {
  return (
    step.title.trim() !== "" ||
    step.teacherActivity.trim() !== "" ||
    step.learnerActivity.trim() !== ""
  );
}

export function emptyEditableStep(): EditableStep {
  return {
    title: "",
    teacherActivity: "",
    learnerActivity: "",
    durationMinutes: "",
  };
}

export function toLessonStepInput(step: EditableStep): LessonStepInput {
  return {
    title: step.title,
    teacherActivity: step.teacherActivity,
    learnerActivity: step.learnerActivity,
    durationMinutes: step.durationMinutes ? Number(step.durationMinutes) : null,
  };
}
