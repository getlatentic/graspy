/** Pure geometry of moving focus in a direction. No DOM here. */
export type Direction = "up" | "down" | "left" | "right";

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Candidate<T> {
  item: T;
  box: Box;
}

/** A gap across the direction costs more than a gap along it, so a neighbour in line wins over a nearer one off to the side. */
const CROSS_WEIGHT = 3;
/** Breaks ties between neighbours in line by how well their centres align. */
const ALIGN_WEIGHT = 0.5;

const centreX = (b: Box) => (b.left + b.right) / 2;
const centreY = (b: Box) => (b.top + b.bottom) / 2;

/**
 * How far `to` is from `from` in `direction`, lower is better; null when it is
 * not that way. It must have its centre that way and either share some of the
 * across-direction span with `from` (a Search button inside its field counts as
 * to the field's right) or lie wholly beyond its edge, so Down never reaches a
 * neighbour at the right whose centre is only lower, nor Right one below.
 */
export function score(from: Box, to: Box, direction: Direction): number | null {
  const horizontal = direction === "left" || direction === "right";
  const centreBeyond = {
    right: centreX(to) > centreX(from),
    left: centreX(to) < centreX(from),
    down: centreY(to) > centreY(from),
    up: centreY(to) < centreY(from),
  }[direction];
  if (!centreBeyond) return null;

  const [aMin, aMax, bMin, bMax] = horizontal
    ? [from.top, from.bottom, to.top, to.bottom]
    : [from.left, from.right, to.left, to.right];
  const shared = Math.min(aMax, bMax) - Math.max(aMin, bMin);
  const along = {
    right: to.left - from.right,
    left: from.left - to.right,
    down: to.top - from.bottom,
    up: from.top - to.bottom,
  }[direction];
  if (shared <= 0 && along < 0) return null;

  const misaligned = horizontal
    ? Math.abs(centreY(from) - centreY(to))
    : Math.abs(centreX(from) - centreX(to));
  return (
    Math.max(0, along) +
    CROSS_WEIGHT * Math.max(0, -shared) +
    ALIGN_WEIGHT * misaligned
  );
}

/** The candidates that lie in `direction` from `from`, best first; equal scores keep their order in the page. */
export function rank<T>(
  from: Box,
  candidates: readonly Candidate<T>[],
  direction: Direction,
): Candidate<T>[] {
  const scored: { candidate: Candidate<T>; value: number; at: number }[] = [];
  candidates.forEach((candidate, at) => {
    const value = score(from, candidate.box, direction);
    if (value !== null) scored.push({ candidate, value, at });
  });
  scored.sort((a, b) => a.value - b.value || a.at - b.at);
  return scored.map((s) => s.candidate);
}

/** Candidates in reading order: top to bottom, then from the start side (the right in right-to-left writing). Boxes whose middles are less than half the shorter one's height apart are on one row, so a tall button and a short link in one header read left to right. */
export function inReadingOrder<T>(
  candidates: readonly Candidate<T>[],
  rtl: boolean,
): Candidate<T>[] {
  const side = (c: Candidate<T>) => (rtl ? -c.box.right : c.box.left);
  const middle = (c: Candidate<T>) => centreY(c.box);
  const height = (c: Candidate<T>) => c.box.bottom - c.box.top;
  return [...candidates].sort((a, b) => {
    const apart = middle(a) - middle(b);
    const sameRow = Math.abs(apart) < Math.min(height(a), height(b)) / 2;
    return sameRow ? side(a) - side(b) : apart;
  });
}

export function intersects(a: Box, b: Box): boolean {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

/** The part of `a` inside `b`, or null when none. */
export function clip(a: Box, b: Box): Box | null {
  const box = {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
  return box.right > box.left && box.bottom > box.top ? box : null;
}
