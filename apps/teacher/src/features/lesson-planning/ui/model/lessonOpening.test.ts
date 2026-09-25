import { describe, expect, it } from "vitest";

import { openingForTaskKind, readOpening } from "./lessonOpening";

describe("where a lesson opens when work is reopened", () => {
  /// The defect this exists for: every kind of work landed on the plan, so a
  /// stopped slides build opened a lesson with no sign of the build.
  it("opens each kind of work where that work is", () => {
    expect(openingForTaskKind("lesson_note")).toBe("note");
    expect(openingForTaskKind("classwork")).toBe("classwork");
    expect(openingForTaskKind("differentiated_classwork")).toBe("groupClasswork");
  });

  /// A lesson being prepared shows the run in its own pane, so the lesson is
  /// already where the teacher needs to be.
  it("leaves preparation to the lesson itself", () => {
    expect(openingForTaskKind("lesson_preparation")).toBeNull();
  });

  it("ignores work it does not know, rather than guessing a destination", () => {
    expect(openingForTaskKind("something_else")).toBeNull();
    expect(readOpening("something_else")).toBeNull();
    expect(readOpening(null)).toBeNull();
  });

  it("reads back every token it writes", () => {
    for (const kind of ["lesson_note", "classwork", "differentiated_classwork"]) {
      const token = openingForTaskKind(kind);
      expect(token, kind).not.toBeNull();
      expect(readOpening(token), kind).not.toBeNull();
    }
  });

  it("names an artifact or the deeper work, and says which", () => {
    expect(readOpening("note")).toEqual({ at: "artifact", tab: "note" });
    expect(readOpening("classwork")).toEqual({ at: "work", work: "classwork" });
    expect(readOpening("groupClasswork")).toEqual({ at: "work", work: "groupClasswork" });
  });
});
