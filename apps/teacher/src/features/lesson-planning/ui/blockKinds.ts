import type { LessonBlockType } from "../domain/lessonContentEditing";

/**
 * What each kind of block is made of: a prose box, and for the two that ask
 * something, the answer beside it.
 *
 * Three branches, of which two differed only in which field they wrote to and
 * what the boxes were called — so adding a kind meant another branch rather
 * than another row.
 */
export const BLOCK_KINDS = {
  explanation: {
    noun: "explanation",
    prose: { field: "content", label: "Explanation", placeholder: "Explain the idea to a learner." },
    answer: null,
  },
  worked_example: {
    noun: "worked example",
    prose: {
      field: "problem",
      label: "Worked example problem",
      placeholder: "The problem to work through.",
    },
    answer: { field: "finalAnswer", label: "Worked example answer" },
  },
  practice: {
    noun: "practice",
    prose: {
      field: "question",
      label: "Practice question",
      placeholder: "A question for learners to try.",
    },
    answer: { field: "expectedAnswer", label: "Practice answer" },
  },
} as const;

/** The ways to add one, read off the same table that renders them. */
export const BLOCK_CHOICES = (Object.keys(BLOCK_KINDS) as LessonBlockType[]).map((type) => ({
  type,
  label: `Add ${BLOCK_KINDS[type].noun}`,
}));
