import { useEffect, useState, useSyncExternalStore } from "react";
import {
  hasParentSession,
  parentSessionEnds,
  subscribeParentSession,
} from "@/lib/api/session";

/** Whether the parent's session is in force. It turns false when the server refuses it and when
 * its minutes are up, so what needs the parent asks for the PIN again rather than failing. */
export function useParentSession(): boolean {
  const live = useSyncExternalStore(subscribeParentSession, hasParentSession);
  const [, ended] = useState(0);

  useEffect(() => {
    const ends = parentSessionEnds();
    if (ends === null) return;
    const timer = setTimeout(
      () => ended((count) => count + 1),
      Math.max(0, ends - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [live]);

  return live;
}
