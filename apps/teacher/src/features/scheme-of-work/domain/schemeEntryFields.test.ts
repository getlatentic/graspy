import { describe, expect, it } from "vitest";

import { entryRequestOf, fieldsOf } from "./schemeEntryFields";
import type { SchemeEntry } from "./schemeOfWork";

const entry = {
  id: "entry-1",
  topic: "Ordering fractions",
  subtopic: "Common denominators",
  curriculumUnit: { id: "unit", title: "Number" },
  curriculumOutcomes: [{ id: "o1", statement: "Compare fractions" }, { id: "o2", statement: "Order them" }],
  objectives: ["Find a common denominator", "Compare numerators"],
  assessment: ["Order three fractions"],
  instructionalMaterials: ["Fraction strips"],
  notes: "Bring the strips",
} as unknown as SchemeEntry;

describe("a weekly plan as the words a teacher types", () => {
  it("fills every box from the plan being edited", () => {
    expect(fieldsOf(entry)).toEqual({
      topic: "Ordering fractions",
      subtopic: "Common denominators",
      curriculumUnit: "Number",
      // The multi-line boxes are one statement per line.
      curriculumOutcomes: "Compare fractions\nOrder them",
      objectives: "Find a common denominator\nCompare numerators",
      assessment: "Order three fractions",
      instructionalMaterials: "Fraction strips",
      notes: "Bring the strips",
    });
  });

  it("starts empty for a plan being written, with no identity to save against", () => {
    const fields = fieldsOf(null);
    expect(Object.values(fields).every((value) => value === "")).toBe(true);
    expect(entryRequestOf(fields, null, "week-1").entryId).toBeNull();
  });

  /// A teacher who typed only spaces into an optional line meant to leave it
  /// blank, and the lists are what the boxes say line by line.
  it("reads the boxes back as lists, and blank optional lines as nothing", () => {
    const request = entryRequestOf(
      { ...fieldsOf(entry), subtopic: "   ", notes: "  ", objectives: "One\n\nTwo" },
      entry,
      "week-1",
    );
    expect(request.subtopic).toBeNull();
    expect(request.notes).toBeNull();
    expect(request.objectives).toEqual(["One", "Two"]);
    expect(request.entryId).toBe("entry-1");
  });

  /// What is typed survives the round trip, which is what the eight separate
  /// states were doing by hand.
  it("returns what was filled in, unchanged", () => {
    const request = entryRequestOf(fieldsOf(entry), entry, "week-1");
    expect(request.topic).toBe(entry.topic);
    expect(request.instructionalMaterials).toEqual(entry.instructionalMaterials);
    expect(request.curriculumOutcomes).toEqual(["Compare fractions", "Order them"]);
  });
});
