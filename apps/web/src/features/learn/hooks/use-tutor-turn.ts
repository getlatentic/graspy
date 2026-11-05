import { useCallback, useMemo, useRef, useState } from "react";
import type { AppCallRequest } from "@/lib/a2a/request-data";
import type { ThreadScope } from "@/lib/chat-db";
import type { Translate } from "@/lib/i18n-context";
import { runTurn, type TurnDeps } from "../lib/tutor-turn";

export function useTutorTurn(deps: TurnDeps) {
  const [busyThreadId, setBusyThreadId] = useState<string | null>(null);
  const [tutorActivity, setActivity] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  // Two taps in one tick both read pre-tap state; the ref flips synchronously.
  const inFlightRef = useRef(false);
  const stopRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (
      content: string,
      scope: ThreadScope,
      t: Translate,
      calls?: AppCallRequest[],
    ) => {
      const text = content.trim();
      if (!text || inFlightRef.current) return;
      inFlightRef.current = true;
      setActivity(null);
      const stop = new AbortController();
      stopRef.current = stop;
      try {
        await runTurn({ text, scope, t, calls }, deps, {
          signal: stop.signal,
          onThread: setBusyThreadId,
          onActivity: setActivity,
          onReconnecting: setReconnecting,
        });
      } finally {
        inFlightRef.current = false;
        stopRef.current = null;
        setActivity(null);
        setReconnecting(false);
        setBusyThreadId(null);
      }
    },
    [deps],
  );

  const stopTutor = useCallback(() => stopRef.current?.abort(), []);

  return useMemo(
    () => ({ send, stopTutor, busyThreadId, tutorActivity, reconnecting }),
    [send, stopTutor, busyThreadId, tutorActivity, reconnecting],
  );
}
