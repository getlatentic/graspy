const SCROLLS = new Set(["auto", "scroll", "overlay"]);

interface Edges {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const px = (value: string) => Number.parseFloat(value) || 0;

/** How far to scroll to bring `rect` inside `view`, by the least distance. */
function shift(lo: number, hi: number, viewLo: number, viewHi: number): number {
  if (lo < viewLo) return lo - viewLo;
  return hi > viewHi ? Math.min(hi - viewHi, lo - viewLo) : 0;
}

/** Scrolls each scroll area around `el` (and the page) just enough to show it; an `overflow: hidden` box is never scrolled. */
export function reveal(el: HTMLElement): void {
  const own = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const want: Edges = {
    top: rect.top - px(own.scrollMarginTop),
    bottom: rect.bottom + px(own.scrollMarginBottom),
    left: rect.left - px(own.scrollMarginLeft),
    right: rect.right + px(own.scrollMarginRight),
  };
  const page =
    el.ownerDocument.scrollingElement ?? el.ownerDocument.documentElement;
  for (let a = el.parentElement; a; a = a.parentElement) {
    const isPage = a === el.ownerDocument.documentElement;
    const style = getComputedStyle(a);
    if (
      !isPage &&
      !SCROLLS.has(style.overflowY) &&
      !SCROLLS.has(style.overflowX)
    ) {
      continue;
    }
    const scroller = isPage && page ? page : a;
    const view = isPage
      ? {
          top: 0,
          left: 0,
          bottom: window.innerHeight,
          right: window.innerWidth,
        }
      : a.getBoundingClientRect();
    const dy = shift(
      want.top,
      want.bottom,
      view.top + px(style.scrollPaddingTop),
      view.bottom - px(style.scrollPaddingBottom),
    );
    const dx = shift(want.left, want.right, view.left, view.right);
    if (dy && (isPage || SCROLLS.has(style.overflowY)))
      scroller.scrollTop += dy;
    if (dx && (isPage || SCROLLS.has(style.overflowX)))
      scroller.scrollLeft += dx;
    want.top -= dy;
    want.bottom -= dy;
    want.left -= dx;
    want.right -= dx;
  }
}

/**
 * Puts focus on `el` and scrolls it into view by the least distance. The
 * browser's own scroll on focus is switched off, since it centres the control
 * on some engines and a TV's browser may not do it at all. Returns whether
 * focus is now on `el`.
 */
export function focusAndReveal(el: HTMLElement): boolean {
  el.focus({ preventScroll: true });
  const root = el.getRootNode() as Document | ShadowRoot;
  if (root.activeElement !== el) return false;
  reveal(el);
  return true;
}
