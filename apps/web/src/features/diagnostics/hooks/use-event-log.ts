import { useCallback, useEffect, useState } from "react";
import { appended, listenForInput, type LogEntry } from "../lib/event-log";

/** The last events the page was sent (keys, pointer, focus), newest first, kept in memory only. */
export function useEventLog() {
  const [log, setLog] = useState<LogEntry[]>([]);

  useEffect(() => {
    const started = performance.now();
    return listenForInput(document, (text, folds) => {
      const entry = { at: performance.now() - started, text, count: 1 };
      setLog((current) => appended(current, entry, folds));
    });
  }, []);

  const clear = useCallback(() => setLog([]), []);
  return { log, clear };
}
