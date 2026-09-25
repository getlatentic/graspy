import { describe, expect, it } from "vitest";

import { editableGroups, evidenceValidation, type LessonEvidenceWorkspaceSnapshot } from "./lessonEvidence";

const snapshot: LessonEvidenceWorkspaceSnapshot = {
  lesson: { lessonId: "lesson", lessonVersionId: "version", lessonVersionNumber: 1, topic: "Equations", learningGoals: ["Solve equations", "Explain inverse operations"] },
  evidence: null,
};

describe("lesson evidence", () => {
  it("starts with exactly three groups and one empty result per goal", () => {
    const groups = editableGroups(snapshot);
    expect(groups.map(({ name }) => name)).toEqual(["Needs support", "Developing", "Secure"]);
    expect(groups.every(({ entries }) => entries.length === 2)).toBe(true);
  });

  it("does not allow completion with missing scores", () => {
    expect(evidenceValidation(editableGroups(snapshot), true)).toBe("Record a score for every group and learning goal before finishing.");
  });

  it("rejects partial and impossible score pairs", () => {
    const groups = editableGroups(snapshot);
    groups[0].entries[0] = { ...groups[0].entries[0], questionsCorrect: 4, questionsTotal: 3 };
    expect(evidenceValidation(groups, false)).toContain("Correct cannot be greater than total");
  });
});
