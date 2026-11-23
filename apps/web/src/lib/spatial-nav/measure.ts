import { FOCUSABLE, measureOne } from "./focusable";
import {
  intersects,
  type Box,
  type Candidate,
  type Direction,
} from "./geometry";

/** A run of this many controls in a row outside the window ends the scan that way: pages are in reading order. */
const MISS_LIMIT = 60;

/** `view` grown by one viewport on every side. */
export function neighbourhood(view: Box): Box {
  const w = view.right - view.left;
  const h = view.bottom - view.top;
  return {
    left: view.left - w,
    top: view.top - h,
    right: view.right + w,
    bottom: view.bottom + h,
  };
}

/** Where to start scanning: the pivot's place among `nodes`, or the first node after it, or the start. */
function startAt(nodes: readonly HTMLElement[], pivot: Node | null): number {
  if (!pivot) return 0;
  const exact = nodes.indexOf(pivot as HTMLElement);
  if (exact >= 0) return exact;
  const after = nodes.findIndex(
    (n) => pivot.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
  return after < 0 ? nodes.length : after;
}

/**
 * The tabbable controls near `pivot` (in document order, outward both ways)
 * whose box meets `window`, so a page of thousands of links costs the ones
 * about the viewport, not all of them. Layout is read once per control.
 */
export function measureNear(
  root: ParentNode,
  pivot: Node | null,
  window: Box,
): Candidate<HTMLElement>[] {
  const nodes = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const found = new Map<number, Candidate<HTMLElement>>();
  const scan = (from: number, step: 1 | -1) => {
    let misses = 0;
    for (
      let i = from;
      i >= 0 && i < nodes.length && misses < MISS_LIMIT;
      i += step
    ) {
      const c = measureOne(nodes[i]);
      if (c && intersects(c.box, window)) {
        found.set(i, c);
        misses = 0;
      } else {
        misses += 1;
      }
    }
  };
  const start = startAt(nodes, pivot);
  scan(start - 1, -1);
  scan(start, 1);
  return [...found.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c);
}

/** Every tabbable control under `root` with an area: the last resort, when nothing is near. */
export function measureAll(root: ParentNode): Candidate<HTMLElement>[] {
  const found: Candidate<HTMLElement>[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    const c = measureOne(el);
    if (c) found.push(c);
  }
  return found;
}

/** How many viewports away in the key's direction a control may be and still be gone to: further, a reader of a long page is not teleported. */
const REACH = 3;

/** Whether `box` is no further than REACH viewports past `view` in `direction`. */
export function withinReach(
  box: Box,
  view: Box,
  direction: Direction,
): boolean {
  const w = view.right - view.left;
  const h = view.bottom - view.top;
  switch (direction) {
    case "down":
      return box.top <= view.bottom + REACH * h;
    case "up":
      return box.bottom >= view.top - REACH * h;
    case "right":
      return box.left <= view.right + REACH * w;
    default:
      return box.right >= view.left - REACH * w;
  }
}
