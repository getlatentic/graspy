import { useEffect, useState } from "react";

/** How long a screen waits for the server before it offers another try: a cold start takes up
 * to about seven seconds. */
export const SLOW_MS = 8_000;

/** True once `waiting` has been true for `ms` without a break. */
export function useSlow(waiting: boolean, ms = SLOW_MS): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setSlow(true), ms);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [waiting, ms]);
  return waiting && slow;
}
