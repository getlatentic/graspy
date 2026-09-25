import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import "katex/dist/katex.min.css";
import { createRoot } from "react-dom/client";

import type { ClassworkGateway } from "../../features/classwork/application/ClassworkGateway";
import type { ClassworkWorkspaceSnapshot } from "../../features/classwork/domain/classwork";
import { ClassworkWorkspace } from "../../features/classwork/ui/ClassworkWorkspace";

const kinds = ["review", "worked_example", "practice", "solution"] as const;
const labels = {
  review: "Equivalent fractions name the same amount even when the numerator and denominator are different. Use fraction strips to compare one half and two quarters.",
  worked_example: "Place a one-half strip above two one-quarter strips. Their lengths match, so 1/2 = 2/4.",
  practice: "Use fraction strips to decide whether 3/6 and 1/2 are equivalent. Explain what you notice.",
  solution: "They are equivalent because three sixths covers the same length as one half.",
};
const quality = {
  outcome: "passed" as const,
  repairAttempted: false,
  scrubbedClaimCount: 0,
  passes: [{
    stage: "initial" as const,
    passed: true,
    checks: ["content_structure", "learning_goal_alignment", "scope_compliance", "source_presence", "source_validity", "unsupported_source_claims"].map((check) => ({
      check: check as "content_structure",
      passed: true,
      details: [],
    })),
  }],
};

let workspace: ClassworkWorkspaceSnapshot = {
  lesson: {
    lessonId: "lesson",
    lessonVersionId: "version",
    lessonVersionNumber: 1,
    subject: "Mathematics",
    grade: "JSS 2",
    topic: "Equivalent fractions",
    subtopic: "Comparing fraction models",
    learningGoals: ["Compare equivalent fractions using models", "Explain why equivalent fractions name the same amount"],
  },
  run: {
    id: "run", taskId: "lesson-classwork-run",
    status: "complete",
    lessonVersionId: "version",
    lessonVersionNumber: 1,
    documentVersion: { id: "draft-1", versionNumber: 1, status: "draft", changeKind: "initial", changedSectionId: null, teacherDirection: null, restoredFromVersionNumber: null, createdAt: "2026-07-30 10:00:00", approvedAt: null },
    sources: [{
      key: "equivalent-fractions",
      title: "Equivalent fractions",
      publisher: "Siyavula",
      sourceUrl: "https://www.siyavula.com/read/za/mathematics/grade-7",
      licenceName: "Creative Commons Attribution 3.0 Unported",
      licenceUrl: "https://creativecommons.org/licenses/by/3.0/",
      attribution: "Siyavula, CC BY 3.0",
    }],
    figures: [],
    sections: ["Compare the models", "Explain the relationship"].map((stepTitle, sectionIndex) => ({
      id: `section-${sectionIndex + 1}`,
      sequence: sectionIndex + 1,
      stepTitle,
      status: "done" as const,
      title: sectionIndex === 0 ? "See the same amount" : "Name the relationship",
      learningGoalNumbers: [sectionIndex + 1],
      attemptCount: 1,
      lastError: null,
      quality,
      regenerated: false,
      blocks: kinds.map((kind) => ({
        id: `section-${sectionIndex + 1}-${kind}`,
        kind,
        text: sectionIndex === 0 ? labels[kind] : `${labels[kind]} Connect your explanation to the model from the first activity.`,
        learningGoalNumbers: [sectionIndex + 1],
        sourceMaterialKeys: ["equivalent-fractions"],
        teacherEdited: false,
      })),
    })),
  },
};

const gateway: ClassworkGateway = {
  getWorkspace: async () => workspace,
  runGeneration: async () => workspace,
  regenerateSection: async () => workspace,
  cancelGeneration: async () => undefined,
  getFigureData: async () => { throw new Error("This visual state has no figures."); },
  editBlock: async ({ blockId, expectedVersionNumber, text }) => {
    if (!workspace.run?.documentVersion || workspace.run.documentVersion.versionNumber !== expectedVersionNumber) {
      throw new Error("The draft changed in another window.");
    }
    const nextVersion = expectedVersionNumber + 1;
    workspace = {
      ...workspace,
      run: {
        ...workspace.run,
        documentVersion: { id: `draft-${nextVersion}`, versionNumber: nextVersion, status: "draft", changeKind: "initial", changedSectionId: null, teacherDirection: null, restoredFromVersionNumber: null, createdAt: "2026-07-30 10:00:00", approvedAt: null },
        sections: workspace.run.sections.map((section) => ({
          ...section,
          blocks: section.blocks.map((block) => block.id === blockId ? { ...block, text, teacherEdited: true } : block),
        })),
      },
    };
    return workspace;
  },
  approveVersion: async ({ expectedVersionNumber }) => {
    if (!workspace.run?.documentVersion || workspace.run.documentVersion.versionNumber !== expectedVersionNumber) {
      throw new Error("The draft changed before it could be approved.");
    }
    workspace = {
      ...workspace,
      run: {
        ...workspace.run,
        documentVersion: {
          ...workspace.run.documentVersion,
          status: "approved",
          changeKind: "initial",
          changedSectionId: null,
          teacherDirection: null,
          restoredFromVersionNumber: null,
          createdAt: "2026-07-30 10:00:00",
          approvedAt: new Date().toISOString(),
        },
      },
    };
    return workspace;
  },
  getSectionHistory: async () => { throw new Error("Not available in the Issue 17 visual state."); },
  restoreSection: async () => workspace,
};

const root = document.getElementById("root");
if (!root) throw new Error("Visual-check root is missing.");
createRoot(root).render(
  <ClassworkWorkspace
    lessonId="lesson"
    context={{ academicSessionId: "session", academicPeriodId: "period", teachingAssignmentId: "assignment" }}
    gateway={gateway}
    onBack={() => undefined}
    onOpenGroupClasswork={() => undefined}
  />,
);
