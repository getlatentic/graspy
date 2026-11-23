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

/** How far `to` is from `from` in `direction`, lower is better; null when its centre is not that way. A control inside the field it sits in (a Search button) counts as being to its right. */
export function score(from: Box, to: Box, direction: Direction): number | null {
  const horizontal = direction === "left" || direction === "right";
  const forward = {
    right: centreX(to) > centreX(from),
    left: centreX(to) < centreX(from),
    down: centreY(to) > centreY(from),
    up: centreY(to) < centreY(from),
  }[direction];
  if (!forward) return null;

  const along = {
    right: to.left - from.right,
    left: from.left - to.right,
    down: to.top - from.bottom,
    up: from.top - to.bottom,
  }[direction];
  const [aMin, aMax, bMin, bMax] = horizontal
    ? [from.top, from.bottom, to.top, to.bottom]
    : [from.left, from.right, to.left, to.right];
  const across = Math.max(0, Math.max(aMin, bMin) - Math.min(aMax, bMax));
  const misaligned = horizontal
    ? Math.abs(centreY(from) - centreY(to))
    : Math.abs(centreX(from) - centreX(to));
  return Math.max(0, along) + CROSS_WEIGHT * across + ALIGN_WEIGHT * misaligned;
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
