/** jsdom does no layout, so a test says where each element is. */
export interface Place {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function place(el: Element, at: Place): void {
  const rect = {
    ...at,
    x: at.left,
    y: at.top,
    right: at.left + at.width,
    bottom: at.top + at.height,
    toJSON: () => at,
  };
  el.getBoundingClientRect = () => rect;
}

/** Lays `buttons` out on a grid of `columns`, `cell` apart, and returns them in reading order. */
export function placeGrid(
  buttons: Element[],
  columns: number,
  cell = 120,
  size = 100,
): void {
  buttons.forEach((el, i) =>
    place(el, {
      left: (i % columns) * cell,
      top: Math.floor(i / columns) * cell,
      width: size,
      height: size,
    }),
  );
}
