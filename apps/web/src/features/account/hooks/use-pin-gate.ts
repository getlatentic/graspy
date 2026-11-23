import { useCallback, useEffect, useState } from "react";
import {
  consentProblemOf,
  type ConsentProblem,
} from "@/lib/account/consent-problem";
import {
  getPinStatus,
  pinRefusalOf,
  savePin,
  tooEasy,
  verifyPin,
  DEFAULT_PIN_LENGTH,
  type PinStatus,
} from "@/lib/account/parent-pin-api";
import { prepareSignIn, signInAgain } from "@/lib/account/sign-in";

/** Where the parent is in being asked for the PIN. A parent with a PIN types it; one without, or
 * who forgot it, chooses one, types it again and signs in with Google to save it. Typing or
 * saving it makes the parent's session, which the gate watches for; nothing here says so. */
export type PinStage =
  | { kind: "loading" }
  | { kind: "unreachable" }
  | { kind: "enter"; length: number }
  | { kind: "locked"; until: number }
  | { kind: "choose" }
  | { kind: "again"; pin: string }
  | { kind: "save"; pin: string };

/** Why the last entry was not taken. */
export type PinError = "wrong" | "mismatch" | "easy" | "busy" | "failed";

function stageOf(status: PinStatus): PinStage {
  if (!status.hasPin) return { kind: "choose" };
  if (status.lockedUntil && status.lockedUntil > Date.now()) {
    return { kind: "locked", until: status.lockedUntil };
  }
  return { kind: "enter", length: status.length ?? DEFAULT_PIN_LENGTH };
}

export function usePinGate() {
  const [stage, setStage] = useState<PinStage>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PinError | null>(null);
  // Goes up with each entry that was not taken: the pad shakes and clears.
  const [failures, setFailures] = useState(0);
  const [problem, setProblem] = useState<ConsentProblem | null>(null);

  const refuse = useCallback((why: PinError) => {
    setError(why);
    setFailures((count) => count + 1);
  }, []);

  const load = useCallback(() => {
    setStage({ kind: "loading" });
    setError(null);
    getPinStatus()
      .then((status) => setStage(stageOf(status)))
      .catch((cause: unknown) => {
        console.warn("Asking whether a parent PIN is set failed:", cause);
        setStage({ kind: "unreachable" });
      });
  }, []);

  useEffect(load, [load]);
  useEffect(prepareSignIn, []);

  const enter = useCallback(
    async (pin: string) => {
      setBusy(true);
      setError(null);
      try {
        await verifyPin(pin);
      } catch (cause) {
        const refusal = pinRefusalOf(cause);
        if (refusal?.kind === "locked") {
          setStage({ kind: "locked", until: refusal.until });
        } else if (refusal?.kind === "notSet") {
          load();
        } else if (refusal?.kind === "wrong") {
          refuse("wrong");
        } else {
          if (!refusal) console.warn("Typing the PIN failed:", cause);
          refuse(refusal?.kind === "busy" ? "busy" : "failed");
        }
      } finally {
        setBusy(false);
      }
    },
    [load, refuse],
  );

  const choose = useCallback(
    (pin: string) => {
      setError(null);
      if (tooEasy(pin)) refuse("easy");
      else setStage({ kind: "again", pin });
    },
    [refuse],
  );

  const again = useCallback(
    (first: string, second: string) => {
      setError(null);
      if (first === second) {
        setStage({ kind: "save", pin: first });
        return;
      }
      setStage({ kind: "choose" });
      refuse("mismatch");
    },
    [refuse],
  );

  // Not async: Google's window must open within the tap.
  const save = useCallback(
    (pin: string) => {
      setBusy(true);
      setProblem(null);
      signInAgain()
        .then((firebaseIdToken) => savePin(pin, { firebaseIdToken }))
        .catch((cause: unknown) => {
          if (pinRefusalOf(cause)?.kind === "tooEasy") {
            setStage({ kind: "choose" });
            refuse("easy");
            return;
          }
          const found = consentProblemOf(cause);
          if (found) console.warn("Saving the PIN failed:", cause);
          setProblem(found);
        })
        .finally(() => setBusy(false));
    },
    [refuse],
  );

  const forgot = useCallback(() => {
    setError(null);
    setStage({ kind: "choose" });
  }, []);

  return {
    stage,
    busy,
    error,
    failures,
    problem,
    enter,
    choose,
    again,
    save,
    forgot,
    reload: load,
  };
}
