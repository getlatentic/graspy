import { describe, expect, it } from "vitest";
import type { Direction } from "./geometry";
import {
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
    ["pointer", "tab", "pad"],
    ["pad", "tab", "pad"],
    ["pointer", "moved", "pad"],
    ["pad", "moved", "pad"],
  ];
  it.each(table)("%s then %s is %s", (from, event, to) => {
    expect(reduce(from, event)).toBe(to);
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
  ];

  it("navigates in a pad session whatever has focus and whichever arrow", () => {
    for (const focus of focuses) {
      for (const d of all) {
        expect(planArrow("pad", focus, d)).toEqual({
          action: "navigate",
          mode: "pad",
        });
      }
    }
  });

  it("leaves all four arrows native in a pointer session with nothing or a title focused", () => {
    for (const focus of ["none", "title"] as const) {
      for (const d of all) {
        expect(planArrow("pointer", focus, d)).toEqual({
          action: "native",
          mode: "pointer",
        });
      }
    }
  });

  it("treats a control whose ring is shown as the pad's, and goes to the pad session", () => {
    for (const d of all) {
      expect(planArrow("pointer", "visible-control", d)).toEqual({
        action: "navigate",
        mode: "pad",
      });
    }
  });

  it("keeps Up and Down native on a clicked control, and sends Left and Right to the pad", () => {
    for (const d of vertical) {
      expect(planArrow("pointer", "hidden-control", d)).toEqual({
        action: "native",
        mode: "pointer",
      });
    }
    for (const d of horizontal) {
      expect(planArrow("pointer", "hidden-control", d)).toEqual({
        action: "navigate",
        mode: "pad",
      });
    }
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
