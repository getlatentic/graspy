import { describe, expect, it } from "vitest";

import { afterLeaving, leavingLabel } from "./lessonPaneWork";

describe("the deeper work a lesson opens into", () => {
  it("returns to the lesson from its instructionalMaterials", () => {
    expect(afterLeaving({ kind: "classwork", lessonId: "l1" })).toBeNull();
  });

  it("returns to the lesson from the class results", () => {
    expect(afterLeaving({ kind: "classResults", lessonId: "l1" })).toBeNull();
  });

  /// Group classwork is reached through the classwork, so leaving it lands
  /// where the teacher came from rather than skipping a step they walked.
  it("returns to the instructionalMaterials from the group versions of them", () => {
    expect(afterLeaving({ kind: "groupClasswork", lessonId: "l1" })).toEqual({
      kind: "classwork",
      lessonId: "l1",
    });
  });

  it("says where each control leads, so no control claims to leave lessons", () => {
    const labels = (["classwork", "groupClasswork", "classResults"] as const).map((kind) =>
      leavingLabel({ kind, lessonId: "l1" }),
    );
    expect(labels).toEqual([
      "Back to the lesson",
      "Back to the classwork",
      "Back to the lesson",
    ]);
    for (const label of labels) expect(label).not.toContain("lessons");
  });
});
