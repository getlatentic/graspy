import { useEffect, useRef, useState } from "react";

/** Moves focus to the element the ref is given when it appears, and back to the control that
 * opened it when it goes. That control may be replaced by this very change, and is gone from the
 * page by the time an effect runs, so it is noted while this renders, and found again by its
 * `data-restore-focus` if it was replaced. The element needs `tabIndex={-1}`. */
export function useFocusInto<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const key = opener?.dataset?.restoreFocus;

  useEffect(() => {
    ref.current?.focus();
    return () => {
      const back = opener?.isConnected
        ? opener
        : key
          ? document.querySelector<HTMLElement>(`[data-restore-focus="${key}"]`)
          : null;
      back?.focus();
    };
  }, [opener, key]);

  return ref;
}
