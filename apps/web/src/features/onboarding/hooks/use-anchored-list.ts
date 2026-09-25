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

export function usePressOutside(onOutside: () => void, ...boxes: Box[]) {
  useEffect(() => {
    const pressed = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!boxes.some((box) => box.current?.contains(target))) onOutside();
    };
    document.addEventListener("mousedown", pressed);
    return () => document.removeEventListener("mousedown", pressed);
    // The caller fixes how many boxes there are, so the spread is a fixed list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onOutside, ...boxes]);
}
