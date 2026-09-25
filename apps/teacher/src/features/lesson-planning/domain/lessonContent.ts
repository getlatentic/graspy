import { z } from "zod";

const identifier = z.string().min(1);
// A teacher saves this while still writing it, so the words a lesson is made of
// may be empty and are validated for completeness at confirmation, not here. Only
// the identifiers that hold the structure together are always present.
const draftText = z.string();

/**
 * A lesson as a teacher reads and writes it: the learning goals, what to bring,
 * the timed teaching steps and the homework that closes the lesson.
 *
 * It holds none of the curriculum, evidence or model provenance that a generated
 * lesson also carries — a hand-written lesson has none of that, and the read
 * surface never shows it. A generated lesson projects down to this shape for
 * reading; a hand-written lesson is authored in it directly. One shape, so the
 * lesson is read and edited through one surface rather than a form beside a view.
 */

/** A block within a teaching step, shown as the kind of thing it is. */
export const lessonBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("explanation"), id: identifier, content: draftText }).strict(),
  z
    .object({
      type: z.literal("worked_example"),
      id: identifier,
      problem: draftText,
      steps: z.array(z.object({ label: draftText, content: draftText }).strict()),
      finalAnswer: draftText,
    })
    .strict(),
  z
    .object({
      type: z.literal("practice"),
      id: identifier,
      question: draftText,
      expectedAnswer: draftText,
      hints: z.array(draftText),
    })
    .strict(),
]);

export const lessonContentStepSchema = z
  .object({
    id: identifier,
    title: draftText,
    durationMinutes: z.number().int().positive().nullable(),
    summary: draftText,
    blocks: z.array(lessonBlockSchema),
  })
  .strict();

export const lessonCheckSchema = z
  .object({ id: identifier, question: draftText, expectedAnswer: draftText })
  .strict();

export const lessonContentSchema = z
  .object({
    objectives: z.array(draftText),
    instructionalMaterials: z.array(draftText),
    steps: z.array(lessonContentStepSchema),
    checks: z.array(lessonCheckSchema),
  })
  .strict();

export type LessonBlock = z.infer<typeof lessonBlockSchema>;
export type LessonContentStep = z.infer<typeof lessonContentStepSchema>;
export type LessonCheck = z.infer<typeof lessonCheckSchema>;
export type LessonContent = z.infer<typeof lessonContentSchema>;
