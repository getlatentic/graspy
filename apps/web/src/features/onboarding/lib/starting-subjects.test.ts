import { describe, expect, it } from "vitest";
import { subjectsMatching } from "@/features/onboarding/lib/starting-subjects";

const CLASS = [
  { id: "maths", label: "Mathematics", recommended: true },
  { id: "further", label: "Further Mathematics", recommended: false },
  { id: "basic-science", label: "Basic Science", recommended: false },
  { id: "chem", label: "Chemistry", recommended: false },
  { id: "eng", label: "English Language", recommended: true },
  { id: "yor", label: "Yoruba Language", recommended: false },
  { id: "comp", label: "Computer Studies", recommended: false },
];

describe("subjectsMatching", () => {
  it("finds every subject of the class in the picked family", () => {
    expect(subjectsMatching("maths", CLASS)).toEqual(["maths", "further"]);
    expect(subjectsMatching("sciences", CLASS)).toEqual([
      "basic-science",
      "chem",
    ]);
    expect(subjectsMatching("computing", CLASS)).toEqual(["comp"]);
  });

  it("takes English, not every language", () => {
    expect(subjectsMatching("english", CLASS)).toEqual(["eng"]);
  });

  it("finds nothing without a pick or with an unknown one", () => {
    expect(subjectsMatching(undefined, CLASS)).toEqual([]);
    expect(subjectsMatching("music", CLASS)).toEqual([]);
  });
});
