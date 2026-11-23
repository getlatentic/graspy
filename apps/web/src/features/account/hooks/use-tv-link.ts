import { useCallback, useEffect, useRef, useState } from "react";
import { rememberAccount } from "@/lib/account/tv-known-accounts";
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
    let approver: string | undefined;
    const running = runTvLink({
      onState: (next) => {
        if (next.kind === "linking") approver = next.approver.account;
        setState(next);
      },
      // The account that was named is known to this TV from now on.
      onApproved: (approval) => {
        if (approver) rememberAccount(approver);
        startTvSession(approval);
      },
    });
    link.current = running;
    return running.stop;
  }, [round]);

  const again = useCallback(() => setRound((n) => n + 1), []);
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
