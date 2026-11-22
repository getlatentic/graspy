import {
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { anchoredStyle } from "../lib/select-options";

type Box = RefObject<HTMLElement | null>;

/** `relayoutOn` lists what can move the anchor without a scroll or resize. */
export function useAnchoredStyle(
  anchor: Box,
  relayoutOn: readonly unknown[],
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    const place = () => {
      if (!anchor.current) return;
      setStyle(
        anchoredStyle(anchor.current.getBoundingClientRect(), innerHeight),
      );
    };
    place();
    addEventListener("resize", place);
    // Capturing hears a scroll inside any scrolling parent too.
    addEventListener("scroll", place, true);
    return () => {
      removeEventListener("resize", place);
      removeEventListener("scroll", place, true);
    };
    // The caller fixes relayoutOn's length, so the spread is a fixed list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, ...relayoutOn]);

  return style;
}

/** A finger that moves further than this between down and up is a scroll, not a tap. */
const TAP_SLOP = 10;

interface Press {
  id: number;
  x: number;
  y: number;
}

/** Calls `onOutside` for a tap or click that starts and ends outside the boxes; a swipe or a cancelled press (the browser took it to scroll) leaves the list open. */
export function usePressOutside(onOutside: () => void, ...boxes: Box[]) {
  useEffect(() => {
    let press: Press | null = null;
    const outside = (event: PointerEvent) =>
      !boxes.some((box) => box.current?.contains(event.target as Node));

    const down = (event: PointerEvent) => {
      press = outside(event)
        ? { id: event.pointerId, x: event.clientX, y: event.clientY }
        : null;
    };
    const up = (event: PointerEvent) => {
      const began = press;
      press = null;
      if (!began || began.id !== event.pointerId || !outside(event)) return;
      const moved = Math.hypot(
        event.clientX - began.x,
        event.clientY - began.y,
      );
      if (moved <= TAP_SLOP) onOutside();
    };
    const cancel = () => {
      press = null;
    };

    document.addEventListener("pointerdown", down);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
    };
    // The caller fixes how many boxes there are, so the spread is a fixed list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onOutside, ...boxes]);
}
