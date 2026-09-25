import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import "katex/dist/katex.min.css";
import { createRoot } from "react-dom/client";

import type { DifferentiatedClassworkGateway } from "../../features/differentiated-classwork/application/DifferentiatedClassworkGateway";
import type { DifferentiatedClassworkWorkspaceSnapshot } from "../../features/differentiated-classwork/domain/differentiatedClasswork";
import { DifferentiatedClassworkWorkspace } from "../../features/differentiated-classwork/ui/DifferentiatedClassworkWorkspace";

const kinds = ["review", "worked_example", "practice", "solution"] as const;
const originalText = {
  review: "Equivalent fractions name the same part of a whole. One half and two quarters have the same value.",
  worked_example: "Compare 1/2 and 2/4 by multiplying the numerator and denominator of 1/2 by 2.",
  practice: "Decide whether 3/6 and 1/2 are equivalent. Explain your answer.",
  solution: "They are equivalent because 3/6 simplifies to 1/2.",
};
const adjustedText = {
  review: "Think of one whole strip. Fold one strip into 2 equal parts and shade 1. Fold another into 4 equal parts and shade 2. The shaded lengths match, so 1/2 and 2/4 have the same value.",
  worked_example: "Step 1: Start with 1/2. Step 2: Multiply both 1 and 2 by 2. Step 3: Read the result, 2/4. A common slip is to compare only the denominators; compare the amount represented instead.",
  practice: "Use fraction strips to decide whether 3/6 and 1/2 cover the same length. Then complete: 1 × __ = 3 and 2 × __ = 6.",
  solution: "The multiplier is 3 in both blanks. Therefore 1/2 = 3/6. The fraction strips also cover the same length.",
};
const quality = {
  outcome: "passed" as const,
  repairAttempted: false,
  scrubbedClaimCount: 0,
  passes: [{
    stage: "initial" as const,
    passed: true,
    checks: ["content_structure", "learning_goal_preservation", "block_alignment", "source_scope", "differentiation_presence", "unsupported_claims"].map((check) => ({
      check: check as "content_structure",
      passed: true,
      details: [],
    })),
  }],
};
const baseBlocks = kinds.map((kind, index) => ({
  id: `base-${kind}`,
  kind,
  text: originalText[kind],
  learningGoalNumbers: [index === 0 ? 2 : 1],
  sourceMaterialKeys: ["equivalent-fractions"], teacherEdited: false,
}));
const workspace: DifferentiatedClassworkWorkspaceSnapshot = {
  lesson: {
    lessonId: "lesson",
    lessonVersionId: "version",
    lessonVersionNumber: 1,
    subject: "Mathematics",
    grade: "JSS 2",
    topic: "Equivalent fractions",
    subtopic: null,
    learningGoals: ["Compare equivalent fractions", "Explain why equivalent fractions have the same value"],
  },
  readiness: { canStart: true, blockers: [] },
  run: {
    id: "run", taskId: "group-classwork-run",
    status: "complete",
    baseRunId: "base-run",
    evidenceSetId: "results",
    evidenceRevision: 2,
    groups: ["Bridge group", "Practice group", "Challenge group"].map((name, groupIndex) => ({
      id: `group-${groupIndex}`,
      evidenceGroupId: `results-group-${groupIndex}`,
      position: groupIndex + 1,
      name,
      learnerState: [{
        learningGoalNumber: 1,
        learningGoal: "Compare equivalent fractions",
        masteryBand: groupIndex === 0 ? "remediate" : groupIndex === 1 ? "reinforce" : "extend",
        mastery: `${groupIndex + 1} of 3 exit-test questions correct`,
        confidence: groupIndex === 0 ? "a little sure (2/5)" : "mostly sure (4/5)",
        perceivedDifficulty: groupIndex === 0 ? "difficult (4/5)" : "okay (3/5)",
        commonMisunderstanding: groupIndex === 0 ? "Compares only the denominators" : null,
      }],
      sessionSignals: {
        interest: groupIndex === 0 ? "a little interested (2/5)" : "very interested (5/5)",
        lessonFeeling: groupIndex === 0 ? "still unsure (2/5)" : "ready to continue (5/5)",
      },
      sections: [{
        id: `section-${groupIndex}`,
        baseSectionId: "base-section",
        sequence: 1,
        stepTitle: "Compare the models",
        status: "done",
        attemptCount: 1,
        lastError: null,
        title: "Equivalent fractions",
        learningGoalNumbers: [1, 2],
        quality,
        baseSection: {
          id: "base-section",
          sequence: 1,
          stepTitle: "Compare the models",
          title: "Equivalent fractions",
          learningGoalNumbers: [1, 2],
          blocks: baseBlocks,
        },
        blocks: kinds.map((kind, index) => ({
          id: `adjusted-${groupIndex}-${kind}`,
          baseBlockId: `base-${kind}`,
          kind,
          text: groupIndex === 0 ? adjustedText[kind] : `${name}: ${adjustedText[kind]}`,
          learningGoalNumbers: [index === 0 ? 2 : 1],
          sourceMaterialKeys: ["equivalent-fractions"], teacherEdited: false,
        })),
      }],
    })),
  },
};
const gateway: DifferentiatedClassworkGateway = {
  getWorkspace: async () => workspace,
  runGeneration: async () => workspace,
  cancelGeneration: async () => undefined,
};
const root = document.getElementById("root");
if (!root) throw new Error("Visual-check root is missing.");
createRoot(root).render(
  <DifferentiatedClassworkWorkspace
    lessonId="lesson"
    context={{ academicSessionId: "session", academicPeriodId: "period", teachingAssignmentId: "assignment" }}
    gateway={gateway}
    onBack={() => undefined}
  />,
);
