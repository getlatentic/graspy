import { describe, expect, it } from "vitest";
import {
  inReadingOrder,
  intersects,
  rank,
  score,
  type Box,
  type Candidate,
} from "./geometry";

const box = (left: number, top: number, w = 100, h = 100): Box => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
});
const at = (name: string, b: Box): Candidate<string> => ({
  item: name,
  box: b,
});

describe("score", () => {
  it("is null for a box that is not that way", () => {
    expect(score(box(0, 0), box(200, 0), "left")).toBeNull();
    expect(score(box(0, 0), box(0, 200), "up")).toBeNull();
    expect(score(box(0, 0), box(0, 0), "right")).toBeNull();
  });

  it("counts a control inside the field it sits in as being to the field's right, and the field as left of it", () => {
    const field = box(0, 0, 400, 60);
    const search = box(330, 10, 40, 40);
    expect(score(field, search, "right")).not.toBeNull();
    expect(score(search, field, "left")).not.toBeNull();
    expect(score(field, search, "down")).toBeNull();
  });

  it("is lower for a nearer box in line than for one off to the side", () => {
    const inLine = score(box(0, 0), box(300, 0), "right")!;
    const aside = score(box(0, 0), box(150, 260), "right")!;
    expect(inLine).toBeLessThan(aside);
  });
});

describe("a neighbour that is only sideways", () => {
  it("is not below: Down never goes to a right-hand neighbour whose centre is lower", () => {
    const here = box(0, 0);
    const right = box(150, 30);
    expect(score(here, right, "down")).toBeNull();
    expect(rank(here, [at("right", right)], "down")).toEqual([]);
  });

  it("is not to the right: Right never drops to a button below that starts under it", () => {
    const here = box(0, 0);
    const below = box(20, 120);
    expect(score(here, below, "right")).toBeNull();
    expect(rank(here, [at("below", below)], "right")).toEqual([]);
  });

  it("still goes to a neighbour that shares part of the span, and to one wholly beyond", () => {
    const here = box(0, 0);
    expect(score(here, box(60, 120), "down")).not.toBeNull();
    expect(score(here, box(300, 40), "right")).not.toBeNull();
  });
});

describe("rank", () => {
  const grid = [
    at("a", box(0, 0)),
    at("b", box(120, 0)),
    at("c", box(240, 0)),
    at("d", box(0, 120)),
    at("e", box(120, 120)),
    at("f", box(240, 120)),
  ];
  const first = (from: string, direction: Parameters<typeof rank>[2]) =>
    rank(grid.find((c) => c.item === from)!.box, grid, direction)[0]?.item;

  it("moves through a grid by rows and columns", () => {
    expect(first("a", "right")).toBe("b");
    expect(first("b", "right")).toBe("c");
    expect(first("c", "left")).toBe("b");
    expect(first("b", "down")).toBe("e");
    expect(first("f", "up")).toBe("c");
  });

  it("has no answer at the edge of the grid", () => {
    expect(first("a", "left")).toBeUndefined();
    expect(first("a", "up")).toBeUndefined();
    expect(first("f", "right")).toBeUndefined();
    expect(first("f", "down")).toBeUndefined();
  });

  it("goes to the column when the next row has fewer items", () => {
    const rows = [
      at("wide", box(0, 0, 400, 50)),
      at("left", box(0, 100, 100, 50)),
      at("right", box(300, 100, 100, 50)),
    ];
    expect(rank(rows[0].box, rows, "down")[0].item).toBe("left");
    expect(rank(box(300, 0, 100, 50), rows, "down")[0].item).toBe("right");
  });

  it("keeps the page's order between equal scores", () => {
    const twins = [at("x", box(0, 200)), at("y", box(0, 200))];
    expect(rank(box(0, 0), twins, "down").map((c) => c.item)).toEqual([
      "x",
      "y",
    ]);
  });
});

describe("inReadingOrder", () => {
  const items = [
    at("b", box(200, 0)),
    at("c", box(0, 100)),
    at("a", box(0, 0)),
  ];

  it("goes top to bottom, then left to right", () => {
    expect(inReadingOrder(items, false).map((c) => c.item)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("starts from the right in right-to-left writing", () => {
    expect(inReadingOrder(items, true).map((c) => c.item)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
});

describe("inReadingOrder on a row of different heights", () => {
  it("puts the logo before a taller button that starts higher", () => {
    const row = [
      at("button", box(800, 10, 200, 80)),
      at("link", box(100, 30, 100, 40)),
    ];
    expect(inReadingOrder(row, false).map((c) => c.item)).toEqual([
      "link",
      "button",
    ]);
  });
});

describe("intersects", () => {
  it("tells overlapping boxes from boxes that only touch", () => {
    expect(intersects(box(0, 0), box(50, 50))).toBe(true);
    expect(intersects(box(0, 0), box(100, 0))).toBe(false);
  });
});
