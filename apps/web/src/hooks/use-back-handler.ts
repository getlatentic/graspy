import { useEffect, useRef } from "react";
import { pushBack } from "@/lib/back-stack";

/** While `active`, the Back key of a remote calls `close` before it steps back in the app. */
export function useBackHandler(active: boolean, close: () => void): void {
  const latest = useRef(close);
  useEffect(() => {
    latest.current = close;
  });
  useEffect(() => {
    if (!active) return;
    return pushBack(() => latest.current());
  }, [active]);
}
