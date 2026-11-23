import { useCallback, useEffect, useRef, useState } from "react";
import { noteUserInput, trackInput } from "@/lib/account/tv-presence";
import { startTvSession } from "@/lib/api/session";
import {
  runTvLink,
  type TvLink,
  type TvLinkState,
} from "@/lib/account/tv-link-flow";

/** A TV's request to be signed in from a phone: the code to show, and what became of it. An
 * approval does not sign the device in: `linking` waits for `confirm` (which signs it in, and
 * which the account store then reports) or `decline`. `again` asks for a new code. */
export function useTvLink() {
  const [state, setState] = useState<TvLinkState>({ kind: "starting" });
  const [round, setRound] = useState(0);
  const link = useRef<TvLink | null>(null);

  useEffect(() => {
    // What a person does here from now on is the TV's proof that someone is there. Starting the
    // flow is not: a boot, a redirect or a restart by a timer lands here too, and presence comes
    // only from the press that asked for it (the sign-in card's link and `again`).
    const stopTracking = trackInput();
    const running = runTvLink({
      onState: setState,
      onApproved: startTvSession,
    });
    link.current = running;
    return () => {
      stopTracking();
      running.stop();
    };
  }, [round]);

  /** A new code. Called from the press that asked for it, with that event, which is the
   * proof someone is there; called with none, by anything automatic, it renews nothing. */
  const again = useCallback((event?: Pick<Event, "isTrusted">) => {
    if (event) noteUserInput(event);
    setRound((n) => n + 1);
  }, []);
  const confirm = useCallback(() => link.current?.confirm(), []);
  const decline = useCallback(() => link.current?.decline(), []);
  return { state, again, confirm, decline };
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
