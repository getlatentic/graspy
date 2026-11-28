import { useEffect, useMemo, useRef, useState } from "react";
import { TURNSTILE_SITE_KEY } from "@/lib/env";
import { ChallengeError, hostChallenge } from "./challenge";
import { loadTurnstile } from "./turnstile-script";

// The action the server expects in Siteverify's answer (apps/server/src/app/security/turnstile.py).
export const CHALLENGE_ACTION = "try";

interface Settlement {
  token: Promise<string>;
  resolve: (token: string) => void;
  reject: (error: ChallengeError) => void;
}

const onTelevision = (): boolean =>
  document.documentElement.dataset.device === "tv";

/**
 * Makes the page that calls it the host of the Turnstile check while it is mounted: the widget is
 * rendered into `container` when a session needs a token, and removed once it has given one. The
 * check runs once per request for a token, never per message. A TV's browser cannot answer an
 * interactive check, so when the widget asks for one there the check ends as unsupported.
 * `interactive` is true while the widget has something for the visitor to do.
 */
export function useChallengeHost() {
  const container = useRef<HTMLDivElement>(null);
  const waiting = useRef<Settlement | null>(null);
  const [running, setRunning] = useState(false);
  const [interactive, setInteractive] = useState(false);

  const host = useMemo(() => {
    const settle = (outcome: (waiter: Settlement) => void) => {
      const waiter = waiting.current;
      waiting.current = null;
      setRunning(false);
      setInteractive(false);
      if (waiter) outcome(waiter);
    };
    return {
      // One check at a time: a second ask shares the one running.
      solve: () => {
        if (waiting.current) return waiting.current.token;
        let settlement!: Omit<Settlement, "token">;
        const token = new Promise<string>((resolve, reject) => {
          settlement = { resolve, reject };
        });
        waiting.current = { ...settlement, token };
        setRunning(true);
        return token;
      },
      done: (token: string) => settle((waiter) => waiter.resolve(token)),
      fail: (kind: ChallengeError["kind"]) =>
        settle((waiter) => waiter.reject(new ChallengeError(kind))),
    };
  }, []);

  // A check still waiting when the page is left ends, so no later visit waits on it. StrictMode
  // unmounts and mounts again at once, which is not leaving: the end waits for that to settle.
  const mounted = useRef(false);
  useEffect(() => {
    const release = hostChallenge(host);
    mounted.current = true;
    return () => {
      release();
      mounted.current = false;
      setTimeout(() => {
        if (!mounted.current) host.fail("failed");
      });
    };
  }, [host]);

  useEffect(() => {
    const element = container.current;
    if (!running || !element || !TURNSTILE_SITE_KEY) return;
    let cancelled = false;
    let remove = () => {};
    loadTurnstile().then(
      (api) => {
        if (cancelled) return;
        const id = api.render(element, {
          sitekey: TURNSTILE_SITE_KEY!,
          action: CHALLENGE_ACTION,
          appearance: "interaction-only",
          retry: "never",
          "refresh-expired": "never",
          callback: host.done,
          "error-callback": () => host.fail("failed"),
          "expired-callback": () => host.fail("failed"),
          "timeout-callback": () => host.fail("failed"),
          "unsupported-callback": () => host.fail("unsupported"),
          "before-interactive-callback": () => {
            if (onTelevision()) host.fail("unsupported");
            else setInteractive(true);
          },
        });
        remove = () => id && api.remove(id);
      },
      () => host.fail("failed"),
    );
    return () => {
      cancelled = true;
      remove();
    };
  }, [running, host]);

  return { container, running, interactive };
}
