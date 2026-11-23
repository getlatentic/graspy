import { describe, expect, it } from "vitest";
import type { Direction } from "./geometry";
import {
  initialMode,
  isRealPointer,
  planArrow,
  reduce,
  type FocusKind,
  type Mode,
  type SessionEvent,
} from "./session";

describe("reduce", () => {
  const table: [Mode, SessionEvent, Mode][] = [
    ["pad", "pointer", "pointer"],
    ["pointer", "pointer", "pointer"],
    ["pointer", "moved", "pad"],
    ["pad", "moved", "pad"],
  ];
  it.each(table)("%s then %s is %s", (from, event, to) => {
    expect(reduce(from, event)).toBe(to);
  });
});

describe("initialMode", () => {
  it("is pointer on a desktop, so a reader's arrows scroll", () => {
    expect(initialMode({ tv: false, noHover: false, noPointer: false })).toBe(
      "pointer",
    );
  });
  it.each([
    [{ tv: true, noHover: false, noPointer: false }],
    [{ tv: false, noHover: true, noPointer: false }],
    [{ tv: false, noHover: false, noPointer: true }],
  ])("is pad for a TV, or no hover, or no pointer: %j", (hints) => {
    expect(initialMode(hints)).toBe("pad");
  });
});

describe("planArrow", () => {
  const vertical: Direction[] = ["up", "down"];
  const horizontal: Direction[] = ["left", "right"];
  const all = [...vertical, ...horizontal];
  const focuses: FocusKind[] = [
    "none",
    "title",
    "visible-control",
    "hidden-control",
    "offscreen-control",
  ];
  const navigate = { action: "navigate", mode: "pad" };
  const native = { action: "native", mode: "pointer" };

  it("navigates in a pad session whatever has focus and whichever arrow", () => {
    for (const focus of focuses) {
      for (const d of all) expect(planArrow("pad", focus, d)).toEqual(navigate);
    }
  });

  it("leaves every arrow native when a control that is off screen has focus", () => {
    for (const d of all) {
      expect(planArrow("pointer", "offscreen-control", d)).toEqual(native);
    }
  });

  it("leaves Up and Down native, and takes Left and Right for navigation, with nothing or a title focused", () => {
    for (const focus of ["none", "title"] as const) {
      for (const d of vertical)
        expect(planArrow("pointer", focus, d)).toEqual(native);
      for (const d of horizontal)
        expect(planArrow("pointer", focus, d)).toEqual(navigate);
    }
  });

  it("leaves Left and Right native when something scrolls sideways", () => {
    for (const d of horizontal) {
      expect(planArrow("pointer", "none", d, true)).toEqual(native);
    }
  });

  it("treats a control whose ring is shown as the pad's", () => {
    for (const d of all) {
      expect(planArrow("pointer", "visible-control", d)).toEqual(navigate);
    }
  });

  it("keeps Up and Down native on a clicked control, and sends Left and Right to the pad", () => {
    for (const d of vertical)
      expect(planArrow("pointer", "hidden-control", d)).toEqual(native);
    for (const d of horizontal)
      expect(planArrow("pointer", "hidden-control", d)).toEqual(navigate);
  });
});

describe("isRealPointer", () => {
  const cases: [string, Parameters<typeof isRealPointer>[0], boolean][] = [
    ["a wheel", { type: "wheel" }, true],
    ["a touch", { type: "touchstart" }, true],
    ["a mouse press", { type: "pointerdown", pointerType: "mouse" }, true],
    ["a pen press", { type: "pointerdown", pointerType: "pen" }, true],
    ["a touch press", { type: "pointerdown", pointerType: "touch" }, true],
    [
      "a press that is not a pointer's",
      { type: "pointerdown", pointerType: "keyboard" },
      false,
    ],
    ["a click", { type: "click", detail: 1 }, true],
    ["a click made by the keyboard", { type: "click", detail: 0 }, false],
    [
      "a move by some distance",
      { type: "mousemove", movementX: 3, movementY: 0 },
      true,
    ],
    [
      "a move by none (the page moved under it)",
      { type: "mousemove", movementX: 0, movementY: 0 },
      false,
    ],
    [
      "a pointermove by none",
      { type: "pointermove", pointerType: "mouse", movementX: 0, movementY: 0 },
      false,
    ],
    ["a key", { type: "keydown" }, false],
  ];
  it.each(cases)("%s", (_name, sample, expected) => {
    expect(isRealPointer(sample, null)).toBe(expected);
  });

  it("tells a move from a repeat at the same place when it has no movement fields", () => {
    const at = { type: "mousemove", clientX: 10, clientY: 10 };
    expect(isRealPointer(at, { x: 10, y: 10 })).toBe(false);
    expect(isRealPointer(at, { x: 11, y: 10 })).toBe(true);
    expect(isRealPointer(at, null)).toBe(true);
  });
});
