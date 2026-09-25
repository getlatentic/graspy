import { describe, expect, it } from "vitest";

import { groupByClass } from "./assignmentGrouping";
import type { TeachingAssignment } from "../domain/academicWorkspace";

function assignment(id: string, displayName: string): TeachingAssignment {
  return {
    id,
    academicSessionId: "session",
    displayName,
    status: "active",
    curriculumCourseId: null,
  } as TeachingAssignment;
}

describe("groupByClass", () => {
  it("gathers the subjects a class is taught under one heading", () => {
    const groups = groupByClass([
      assignment("a", "Mathematics · JSS 2"),
      assignment("b", "Basic Science · JSS 2"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.classLabel).toBe("JSS 2");
    expect(groups[0]?.members.map((member) => member.subject)).toEqual([
      "Mathematics",
      "Basic Science",
    ]);
  });

  it("keeps classes in the order they were set up, not sorted", () => {
    const groups = groupByClass([
      assignment("a", "Mathematics · JSS 3"),
      assignment("b", "Mathematics · JSS 1"),
      assignment("c", "English · JSS 3"),
    ]);
    expect(groups.map((group) => group.classLabel)).toEqual(["JSS 3", "JSS 1"]);
  });

  it("gathers nothing from no assignments", () => {
    expect(groupByClass([])).toEqual([]);
  });
});
