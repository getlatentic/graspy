import { useCallback, useRef, useState } from "react";
import { refusalCode } from "@/lib/account/account-call";
import {
  approveTv,
  denyTv,
  lookUpTv,
  type TvAsked,
} from "@/lib/account/tv-link-api";

export type ApprovalProblem =
  | "invalid"
  | "inUse"
  | "wrongEnd"
  | "busy"
  | "full"
  | "consent"
  | "timedOut"
  | "failed";

export type ApprovalStep =
  | { kind: "code" }
  /** Waiting for the server: `approve` says the person is told "Approving…". */
  | { kind: "checking"; approving?: boolean }
  | { kind: "confirm"; code: string; asked: TvAsked }
  | { kind: "done" }
  | { kind: "denied" };

const BY_CODE: Record<string, ApprovalProblem> = {
  code_not_found: "invalid",
  code_in_use: "inUse",
  confirm_mismatch: "wrongEnd",
  too_many_tvs: "full",
  consent_required: "consent",
};

function problemOf(error: unknown): ApprovalProblem {
  const known = BY_CODE[refusalCode(error) ?? ""];
  if (known) return known;
  return (error as { status?: unknown } | null)?.status === 429
    ? "busy"
    : "failed";
}

/** The phone's side: the parent gives the code, sees which device it is, types the end of the
 * code as the TV shows it, and approves or denies. Each step is the server's: the code is not
 * trusted until it has been looked up, and it is held for this account while it is decided.
 * `refused` hears of the parent's session being gone. */
export function useTvApproval(
  onChanged: () => void,
  refused: (error: unknown) => boolean,
) {
  const [step, setStep] = useState<ApprovalStep>({ kind: "code" });
  const [problem, setProblem] = useState<ApprovalProblem | null>(null);
  // One call at a time: characters typed while one is on its way are not another attempt.
  const inFlight = useRef(false);

  const failed = useCallback(
    (error: unknown, back: ApprovalStep) => {
      setStep(back);
      if (refused(error)) return;
      console.warn("Signing a TV in failed:", error);
      setProblem(problemOf(error));
    },
    [refused],
  );

  const lookUp = useCallback(
    (code: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setProblem(null);
      setStep({ kind: "checking" });
      lookUpTv(code)
        .then((asked) => setStep({ kind: "confirm", code, asked }))
        .catch((error: unknown) => failed(error, { kind: "code" }))
        .finally(() => {
          inFlight.current = false;
        });
    },
    [failed],
  );

  const approve = useCallback(
    (
      confirming: ApprovalStep & { kind: "confirm" },
      learnerId: string,
      end: string,
    ) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setProblem(null);
      setStep({ kind: "checking", approving: true });
      approveTv(confirming.code, learnerId, end)
        .then(() => {
          setStep({ kind: "done" });
          onChanged();
        })
        .catch((error: unknown) => {
          // The code was found a moment ago, so a code that is not found now has timed out: the
          // request is held for two minutes, and ends after ten.
          const timedOut = refusalCode(error) === "code_not_found";
          // Typing the end wrong is tried again where it was typed; anything else starts over.
          failed(
            error,
            refusalCode(error) === "confirm_mismatch"
              ? confirming
              : { kind: "code" },
          );
          if (timedOut) setProblem("timedOut");
        })
        .finally(() => {
          inFlight.current = false;
        });
    },
    [failed, onChanged],
  );

  const deny = useCallback(
    (code: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setStep({ kind: "checking" });
      denyTv(code)
        .then(() => setStep({ kind: "denied" }))
        .catch((error: unknown) => failed(error, { kind: "code" }))
        .finally(() => {
          inFlight.current = false;
        });
    },
    [failed],
  );

  const reset = useCallback(() => {
    setProblem(null);
    setStep({ kind: "code" });
  }, []);

  return { step, problem, lookUp, approve, deny, reset };
}
