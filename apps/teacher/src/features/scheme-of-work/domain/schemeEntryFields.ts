import type { SchemeEntry, SaveSchemeEntryRequest } from "./schemeOfWork";
import { lines } from "../../lesson-planning/domain/lessonPlanning";

/**
 * A weekly plan as the words a teacher types, before they are read back as
 * lists and trimmed values.
 *
 * One value rather than eight: they are filled in together from the plan being
 * edited, read together when it is saved, and no field ever changes on its own.
 * Eight `useState`s made that eight things to keep in step, and eight places to
 * forget one.
 */
export interface SchemeEntryFields {
  readonly topic: string;
  readonly subtopic: string;
  readonly curriculumUnit: string;
  readonly curriculumOutcomes: string;
  readonly objectives: string;
  readonly assessment: string;
  readonly instructionalMaterials: string;
  readonly notes: string;
}

/** The words already in a plan, or empty ones for a plan being written. */
export function fieldsOf(entry: SchemeEntry | null): SchemeEntryFields {
  return {
    topic: entry?.topic ?? "",
    subtopic: entry?.subtopic ?? "",
    curriculumUnit: entry?.curriculumUnit.title ?? "",
    curriculumOutcomes:
      entry?.curriculumOutcomes.map(({ statement }) => statement).join("\n") ?? "",
    objectives: entry?.objectives.join("\n") ?? "",
    assessment: entry?.assessment.join("\n") ?? "",
    instructionalMaterials: entry?.instructionalMaterials.join("\n") ?? "",
    notes: entry?.notes ?? "",
  };
}

/**
 * What is saved: the multi-line boxes read back as lists, and the optional
 * single lines as nothing when a teacher left only spaces.
 *
 * Without the teaching context, which belongs to whoever holds the gateway.
 */
export function entryRequestOf(
  fields: SchemeEntryFields,
  entry: SchemeEntry | null,
  weekId: string,
): Omit<SaveSchemeEntryRequest, "context"> {
  return {
    entryId: entry?.id ?? null,
    weekId,
    topic: fields.topic,
    subtopic: fields.subtopic.trim() || null,
    curriculumUnit: fields.curriculumUnit,
    curriculumOutcomes: lines(fields.curriculumOutcomes),
    objectives: lines(fields.objectives),
    assessment: lines(fields.assessment),
    instructionalMaterials: lines(fields.instructionalMaterials),
    notes: fields.notes.trim() || null,
  };
}
