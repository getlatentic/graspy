let moving = false;

/** Runs `move`, which puts focus somewhere because of an arrow key, and returns its answer; focus handlers called inside it can tell (see `arrivedByArrow`). */
export function whileArrowMoves(move: () => boolean): boolean {
  moving = true;
  try {
    return move();
  } finally {
    moving = false;
  }
}

/**
 * Whether focus is arriving because an arrow key moved it. A select's field
 * opens its list on focus (a click or Tab); arriving by arrow it stays closed,
 * so a remote's pad can pass over it, and OK opens it.
 */
export function arrivedByArrow(): boolean {
  return moving;
}
