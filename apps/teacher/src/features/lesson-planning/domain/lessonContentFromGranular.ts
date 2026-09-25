import type { GranularLessonPlan } from "./granularLesson";
import type { LessonBlock, LessonContent } from "./lessonContent";

/**
 * Read a generated lesson as plain lesson content.
 *
 * The provenance a generated lesson carries — which curriculum objective, which
 * knowledge component, which source record backs each part — is dropped: it is
 * how the lesson was made, not the lesson a teacher reads and edits. Figures are
 * left out too; they belong to the source evidence, not to the lesson content,
 * and a hand-written lesson has none.
 */
export function lessonContentFromGranularPlan(plan: GranularLessonPlan): LessonContent {
  return {
    objectives: plan.lessonObjectives.map((objective) => objective.statement),
    instructionalMaterials: plan.materials,
    steps: plan.steps.map((step) => ({
      id: step.id,
      title: step.title,
      durationMinutes: step.durationMinutes,
      summary: step.summary,
      blocks: step.blocks.flatMap((block): LessonBlock[] => {
        switch (block.type) {
          case "explanation":
            return [{ type: "explanation", id: block.id, content: block.content }];
          case "worked_example":
            return [
              {
                type: "worked_example",
                id: block.id,
                problem: block.problem,
                steps: block.steps,
                finalAnswer: block.finalAnswer,
              },
            ];
          case "practice":
            return [
              {
                type: "practice",
                id: block.id,
                question: block.question,
                expectedAnswer: block.expectedAnswer,
                hints: block.hints,
              },
            ];
          case "visual":
            return [];
        }
      }),
    })),
    checks: plan.assessments.map((assessment) => ({
      id: assessment.id,
      question: assessment.question,
      expectedAnswer: assessment.expectedAnswer,
    })),
  };
}
