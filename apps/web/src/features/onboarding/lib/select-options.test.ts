import { describe, expect, it } from "vitest";
import {
  anchoredStyle,
  groupOptions,
  matchingOptions,
  type SelectOption,
} from "./select-options";

const CLASSES: SelectOption[] = [
  { value: "jss-1", label: "JSS 1", group: "Junior", keywords: ["JS1"] },
  { value: "sss-1", label: "SSS 1", group: "Senior" },
  { value: "jss-2", label: "JSS 2", group: "Junior" },
  { value: "graduate", label: "Graduate" },
];

describe("matchingOptions", () => {
  it("finds an option by its label or another name, ignoring spacing and dots", () => {
    expect(matchingOptions(CLASSES, "j.s. 1").map((o) => o.value)).toEqual([
      "jss-1",
    ]);
    expect(matchingOptions(CLASSES, "js1").map((o) => o.value)).toEqual([
      "jss-1",
    ]);
    expect(matchingOptions(CLASSES, "")).toEqual(CLASSES);
  });
});

describe("groupOptions", () => {
  it("gathers each group where it first appears, keeping each option's place", () => {
    expect(groupOptions(CLASSES)).toEqual([
      {
        heading: "Junior",
        members: [
          { option: CLASSES[0], index: 0 },
          { option: CLASSES[2], index: 2 },
        ],
      },
      { heading: "Senior", members: [{ option: CLASSES[1], index: 1 }] },
      { heading: undefined, members: [{ option: CLASSES[3], index: 3 }] },
    ]);
  });
});

describe("anchoredStyle", () => {
  const rect = { left: 10, width: 300, top: 100, bottom: 150 };

  it("opens below an input with room under it", () => {
    expect(anchoredStyle(rect, 800)).toEqual({
      position: "fixed",
      left: 10,
      width: 300,
      top: 154,
    });
  });

  it("opens above an input low on the screen", () => {
    expect(anchoredStyle({ ...rect, top: 600, bottom: 650 }, 800)).toEqual({
      position: "fixed",
      left: 10,
      width: 300,
      top: 596,
      transform: "translateY(-100%)",
    });
  });
});
