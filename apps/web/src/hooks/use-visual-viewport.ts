import { useEffect, useState } from "react";

interface VisibleArea {
  height: number;
  top: number;
}

/** The page minus a phone's on-screen keyboard, which iOS leaves inside dvh.
    Null where the browser does not report it, or while inactive. */
export function useVisualViewport(active: boolean): VisibleArea | null {
  const [area, setArea] = useState<VisibleArea | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport) {
      setArea(null);
      return;
    }
    const measure = () =>
      setArea({ height: viewport.height, top: viewport.offsetTop });
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, [active]);

  return area;
}
