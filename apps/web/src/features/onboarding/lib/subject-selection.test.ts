import { describe, expect, it } from "vitest";
import { SUBJECT_SELECTION_LIMIT } from "../constants";
import { seededSelection, toggledSelection } from "./subject-selection";

const SUBJECTS = [
  { id: "maths", label: "Mathematics", recommended: true },
  { id: "further", label: "Further Mathematics", recommended: false },
  { id: "eng", label: "English Language", recommended: true },
  { id: "chem", label: "Chemistry", recommended: false },
];

describe("toggledSelection", () => {
  it("chooses a subject and lets a chosen one go", () => {
    expect(toggledSelection(["maths"], "eng")).toEqual(["maths", "eng"]);
    expect(toggledSelection(["maths", "eng"], "maths")).toEqual(["eng"]);
  });

  it("chooses no more than the limit", () => {
    const full = Array.from(
      { length: SUBJECT_SELECTION_LIMIT },
      (_, i) => `s${i}`,
    );
    expect(toggledSelection(full, "one-more")).toBe(full);
    expect(toggledSelection(full, "s0")).toHaveLength(
      SUBJECT_SELECTION_LIMIT - 1,
    );
  });
});

describe("seededSelection", () => {
  it("chooses the recommended subjects and the picked family, once each", () => {
    expect(seededSelection(SUBJECTS, "maths")).toEqual([
      "maths",
      "eng",
      "further",
    ]);
    expect(seededSelection(SUBJECTS, undefined)).toEqual(["maths", "eng"]);
  });
});
