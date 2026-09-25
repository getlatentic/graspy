import { useCallback, useEffect, useRef, useState } from "react";

export function useUnread(busyThreadId: string | null) {
  const [unread, setUnread] = useState<ReadonlySet<string>>(new Set());
  const viewingRef = useRef<string | null>(null);
  const runningRef = useRef<string | null>(null);

  useEffect(() => {
    const finished = runningRef.current;
    runningRef.current = busyThreadId;
    if (!finished || busyThreadId || viewingRef.current === finished) return;
    setUnread((prev) => new Set(prev).add(finished));
  }, [busyThreadId]);

  const setViewing = useCallback((threadId: string | null) => {
    viewingRef.current = threadId;
    if (!threadId) return;
    setUnread((prev) => {
      if (!prev.has(threadId)) return prev;
      const next = new Set(prev);
      next.delete(threadId);
      return next;
    });
  }, []);

  return { unread, setViewing };
}
