import { useCallback, useEffect, useState } from "react";
import { startTvSession } from "@/lib/api/session";
import { runTvLink, type TvLinkState } from "@/lib/account/tv-link-flow";

/** A TV's request to be signed in from a phone: the code to show, and what became of it. An
 * approval signs the device in, which the account store then reports. `again` asks for a new code. */
export function useTvLink() {
  const [state, setState] = useState<TvLinkState>({ kind: "starting" });
  const [round, setRound] = useState(0);

  useEffect(
    () => runTvLink({ onState: setState, onApproved: startTvSession }),
    [round],
  );

  const again = useCallback(() => setRound((n) => n + 1), []);
  return { state, again };
}

const secondsUntil = (at: number) =>
  Math.max(0, Math.ceil((at - Date.now()) / 1000));

/** Whole seconds until `expiresAt`, counted down each second; zero once it has passed. */
export function useSecondsLeft(expiresAt: number | null): number {
  const [, tick] = useState(0);

  useEffect(() => {
    if (expiresAt === null) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return expiresAt === null ? 0 : secondsUntil(expiresAt);
}
