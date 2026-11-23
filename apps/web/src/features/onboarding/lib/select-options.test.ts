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
  const at = (top: number, height = 50) => ({
    ...rect,
    top,
    bottom: top + height,
  });

  it("opens below a field with room for the whole list, its height capped to what it needs", () => {
    expect(anchoredStyle(rect, 800, 300, 16)).toEqual({
      position: "fixed",
      left: 10,
      width: 300,
      top: 154,
      maxHeight: 300,
    });
  });

  it("stays below when it does not fit but there is more room below than above", () => {
    const style = anchoredStyle(at(100), 500, 700, 16);
    expect(style.top).toBe(154);
    expect(style.bottom).toBeUndefined();
    // 500 - 150 - 4 gap - 8 edge
    expect(style.maxHeight).toBe(338);
  });

  it("flips above only when it does not fit below and above has more room", () => {
    const style = anchoredStyle(at(600), 800, 300, 16);
    expect(style.bottom).toBe(800 - 600 + 4);
    expect(style.top).toBeUndefined();
    expect(style.maxHeight).toBe(300);
    const squeezed = anchoredStyle(at(300), 500, 400, 16);
    expect(squeezed.bottom).toBe(500 - 300 + 4);
    expect(squeezed.maxHeight).toBe(300 - 4 - 8);
  });

  it("does not flip for a short list that fits below, however low the field is", () => {
    const style = anchoredStyle(at(600), 800, 120, 16);
    expect(style.top).toBe(654);
    expect(style.maxHeight).toBe(120);
  });

  it("caps the list at 28rem, which grows with the root size", () => {
    expect(anchoredStyle(rect, 4000, 0, 16).maxHeight).toBe(28 * 16);
    expect(anchoredStyle(rect, 4000, 9999, 40).maxHeight).toBe(28 * 40);
  });

  it("keeps the gap and the screen's edge in rem, so they grow with the root size", () => {
    const style = anchoredStyle(at(100), 500, 9999, 40);
    expect(style.top).toBe(150 + 10);
    expect(style.maxHeight).toBe(500 - 150 - 10 - 20);
  });

  it("fits 1280x720, 667x375 landscape, 1920x1080 and 3840x2160 without leaving the screen", () => {
    const screens = [
      { w: 1280, h: 720, rem: 16, field: 340 },
      { w: 667, h: 375, rem: 16, field: 150 },
      { w: 1920, h: 1080, rem: 20, field: 340 },
      { w: 3840, h: 2160, rem: 40, field: 680 },
    ];
    for (const { h, rem, field } of screens) {
      const bottom = field + 4 * rem;
      const style = anchoredStyle(
        { left: 0, width: 600, top: field, bottom },
        h,
        40 * rem,
        rem,
      );
      const edgeOf = (style.top as number) + (style.maxHeight as number);
      if (style.top !== undefined) {
        expect(edgeOf).toBeLessThanOrEqual(h);
      } else {
        expect(
          h - (style.bottom as number) - (style.maxHeight as number),
        ).toBeGreaterThanOrEqual(0);
      }
      expect(style.maxHeight as number).toBeGreaterThan(0);
    }
  });
});
