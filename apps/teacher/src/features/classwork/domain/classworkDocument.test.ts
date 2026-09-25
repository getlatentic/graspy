import { describe, expect, it } from "vitest";

import type { ClassworkWorkspaceSnapshot } from "./classwork";
import { buildClassworkDocument } from "./classworkDocument";

const source = {
  key: "ch04-b014",
  title: "Equivalent fractions",
  publisher: "Siyavula",
  sourceUrl: "https://ng.siyavula.com/read",
  licenceName: "Creative Commons Attribution 3.0 Unported",
  licenceUrl: "https://creativecommons.org/licenses/by/3.0/",
  attribution: "Siyavula Mathematics JSS 1, CC BY 3.0.",
};
const snapshot: ClassworkWorkspaceSnapshot = {
  lesson: {
    lessonId: "lesson",
    lessonVersionId: "version",
    lessonVersionNumber: 1,
    subject: "Mathematics",
    grade: "JSS 2",
    topic: "Equivalent fractions",
    subtopic: null,
    learningGoals: ["Compare equivalent fractions."],
  },
  run: {
    id: "run", taskId: "lesson-classwork-run",
    status: "complete",
    lessonVersionId: "version",
    lessonVersionNumber: 1,
    documentVersion: { id: "classwork-version", versionNumber: 1, status: "draft", changeKind: "initial", changedSectionId: null, teacherDirection: null, restoredFromVersionNumber: null, createdAt: "2026-07-30 10:00:00", approvedAt: null },
    sources: [source],
    figures: [{
      id: "figure",
      sourceMaterialKey: source.key,
      sequence: 1,
      caption: "Three equivalent fraction models.",
      altText: "Three rectangles divided into equal parts.",
      widthPx: 810,
      heightPx: 690,
    }],
    sections: [{
      id: "section",
      sequence: 1,
      stepTitle: "Compare models",
      status: "done",
      title: "Comparing equivalent fractions",
      learningGoalNumbers: [1],
      attemptCount: 1,
      lastError: null,
      quality: null,
      regenerated: false,
      blocks: [
        { id: "review", kind: "review", text: "Review", learningGoalNumbers: [1], sourceMaterialKeys: [], teacherEdited: false },
        { id: "example", kind: "worked_example", text: "Example", learningGoalNumbers: [1], sourceMaterialKeys: [source.key], teacherEdited: true },
        { id: "practice", kind: "practice", text: "Practice", learningGoalNumbers: [1], sourceMaterialKeys: [source.key], teacherEdited: false },
        { id: "solution", kind: "solution", text: "Solution", learningGoalNumbers: [1], sourceMaterialKeys: [source.key], teacherEdited: false },
      ],
    }],
  },
};

describe("buildClassworkDocument", () => {
  it("joins activity rows to exact learning-goal text and named sources", () => {
    const document = buildClassworkDocument(snapshot);
    expect(document?.traceability[1]).toEqual({
      item: "Lesson step 1 · Worked example",
      learningGoals: ["Compare equivalent fractions."],
      sources: [source],
      teacherEdited: true,
    });
  });

  it("places each trusted figure once after the first block citing its source", () => {
    const document = buildClassworkDocument(snapshot);
    expect(document?.sections[0].blocks.map(({ figuresAfter }) => figuresAfter.length)).toEqual([0, 1, 0, 0]);
  });

  it("keeps an uncited confirmed-source figure in the document instead of dropping it", () => {
    const withoutFigureCitation = structuredClone(snapshot);
    withoutFigureCitation.run!.sections[0].blocks.forEach((block) => {
      block.sourceMaterialKeys = [];
    });
    const document = buildClassworkDocument(withoutFigureCitation);
    expect(document?.sections[0].blocks.at(-1)?.figuresAfter).toHaveLength(1);
  });
});
