import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import "katex/dist/katex.min.css";
import { createRoot } from "react-dom/client";

import type { ClassworkGateway } from "../../features/classwork/application/ClassworkGateway";
import type { GeneratedClassworkSection, ClassworkWorkspaceSnapshot } from "../../features/classwork/domain/classwork";
import { ClassworkWorkspace } from "../../features/classwork/ui/ClassworkWorkspace";

const context = { academicSessionId: "session", academicPeriodId: "period", teachingAssignmentId: "assignment" };
const lesson = {
  lessonId: "lesson",
  lessonVersionId: "version",
  lessonVersionNumber: 1,
  subject: "Mathematics",
  grade: "JSS 2",
  topic: "Equivalent fractions",
  subtopic: "Comparing fraction models",
  learningGoals: ["Compare equivalent fractions using models", "Explain why equivalent fractions name the same amount"],
};
const kinds = ["review", "worked_example", "practice", "solution"] as const;
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
const initialText = {
  review: "Equivalent fractions name the same amount even when the numerator and denominator are different.",
  worked_example: "Place a one-half strip above two one-quarter strips. Their lengths match, so 1/2 = 2/4.",
  practice: "Use fraction strips to decide whether 3/6 and 1/2 are equivalent. Explain what you notice.",
  solution: "They are equivalent because three sixths covers the same length as one half.",
};
const replacement: GeneratedClassworkSection = {
  title: "Check the match in two ways",
  learningGoalNumbers: [1, 2],
  blocks: kinds.map((kind) => ({
    kind,
    text: kind === "worked_example"
      ? "First, align one-half and two one-quarter strips. Next, multiply 1/2 by 2/2 to get 2/4. The model and calculation agree."
      : `Recreated ${kind.replace("_", " ")} wording for the same learning goals.`,
    learningGoalNumbers: [1, 2],
    sourceMaterialKeys: ["equivalent-fractions"],
  })),
  quality,
};

function section(title: string, regenerated: boolean, texts: Record<(typeof kinds)[number], string>) {
  return {
    id: "section-1",
    sequence: 1,
    stepTitle: "Compare the models",
    status: "done" as const,
    title,
    learningGoalNumbers: [1, 2],
    attemptCount: 1,
    lastError: null,
    quality,
    regenerated,
    blocks: kinds.map((kind) => ({
      id: `section-1-${kind}`,
      kind,
      text: texts[kind],
      learningGoalNumbers: [1, 2],
      sourceMaterialKeys: ["equivalent-fractions"],
      teacherEdited: false,
    })),
  };
}

const originalSection = section("See the same amount", false, initialText);
const recreatedSection = section(
  replacement.title,
  true,
  Object.fromEntries(replacement.blocks.map((block) => [block.kind, block.text])) as Record<(typeof kinds)[number], string>,
);
const failedFixture = new URLSearchParams(location.search).get("fixture") === "failed";
let workspace: ClassworkWorkspaceSnapshot = {
  lesson,
  run: {
    id: "run", taskId: "lesson-classwork-run",
    status: "complete",
    lessonVersionId: "version",
    lessonVersionNumber: 1,
    documentVersion: { id: "draft-1", versionNumber: 1, status: "draft", changeKind: "initial", changedSectionId: null, teacherDirection: null, restoredFromVersionNumber: null, createdAt: "2026-07-18 06:00:00", approvedAt: null },
    sectionRegeneration: failedFixture ? {
      id: "regeneration-failed",
      sectionId: "section-1",
      status: "failed",
      teacherDirection: "Use smaller numbers.",
      lastError: "The replacement repeated the current wording.",
    } : null,
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
    sections: [originalSection],
  },
};

const gateway: ClassworkGateway = {
  getWorkspace: async () => workspace,
  runGeneration: async () => workspace,
  cancelGeneration: async () => undefined,
  getFigureData: async () => { throw new Error("This visual fixture has no figures."); },
  editBlock: async () => workspace,
  approveVersion: async () => workspace,
  // The backend drives recreation; this fixture plays it out on a timer so the
  // generating state is visible before the recreated section arrives.
  regenerateSection: async ({ teacherDirection }) => {
    if (!workspace.run) throw new Error("The draft is unavailable.");
    workspace = {
      ...workspace,
      run: {
        ...workspace.run,
        sectionRegeneration: { id: "regeneration-1", sectionId: "section-1", status: "generating", teacherDirection, lastError: null },
      },
    };
    setTimeout(() => {
      if (!workspace.run) return;
      workspace = {
        ...workspace,
        run: {
          ...workspace.run,
          documentVersion: { ...workspace.run.documentVersion!, id: "draft-2", versionNumber: 2, changeKind: "section_regeneration" },
          sectionRegeneration: null,
          sections: [recreatedSection],
        },
      };
    }, 5_000);
    return workspace;
  },
  getSectionHistory: async () => ({
    currentVersionNumber: workspace.run?.documentVersion?.versionNumber ?? 1,
    versions: [
      ...(workspace.run?.documentVersion?.versionNumber === 2 ? [{
        versionNumber: 2,
        createdAt: "2026-07-18 06:15:00",
        changeKind: "section_regeneration" as const,
        teacherDirection: "Use smaller numbers and explain the check more slowly.",
        restoredFromVersionNumber: null,
        title: recreatedSection.title,
        learningGoalNumbers: [1, 2],
        regenerated: true,
        blocks: recreatedSection.blocks,
      }] : []),
      { versionNumber: 1, createdAt: "2026-07-18 06:00:00", changeKind: "initial", teacherDirection: null, restoredFromVersionNumber: null, title: originalSection.title, learningGoalNumbers: [1, 2], regenerated: false, blocks: originalSection.blocks },
    ],
  }),
  restoreSection: async () => {
    if (workspace.run) workspace = { ...workspace, run: { ...workspace.run, documentVersion: { ...workspace.run.documentVersion!, id: "draft-3", versionNumber: 3, changeKind: "section_restore" }, sections: [originalSection] } };
    return workspace;
  },
};

const root = document.getElementById("root");
if (!root) throw new Error("Visual-check root is missing.");
createRoot(root).render(
  <ClassworkWorkspace
    lessonId="lesson"
    context={context}
    gateway={gateway}
    onBack={() => undefined}
  />,
);
