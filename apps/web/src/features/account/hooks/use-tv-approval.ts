import { useCallback, useState } from "react";
import { refusalCode } from "@/lib/account/account-call";
import {
  approveTv,
  denyTv,
  lookUpTv,
  type TvAsked,
} from "@/lib/account/tv-link-api";

export type ApprovalProblem =
  "invalid" | "busy" | "full" | "consent" | "failed";

export type ApprovalStep =
  | { kind: "code" }
  | { kind: "checking" }
  | { kind: "confirm"; code: string; asked: TvAsked }
  | { kind: "done" }
  | { kind: "denied" };

function problemOf(error: unknown): ApprovalProblem {
  if (refusalCode(error) === "code_not_found") return "invalid";
  if (refusalCode(error) === "too_many_tvs") return "full";
  if (refusalCode(error) === "consent_required") return "consent";
  if ((error as { status?: unknown } | null)?.status === 429) return "busy";
  return "failed";
}

/** The phone's side: the person gives the code, sees which device it is, and approves or denies.
 * Each step is the server's: the code is not trusted until it has been looked up. */
export function useTvApproval(onChanged: () => void) {
  const [step, setStep] = useState<ApprovalStep>({ kind: "code" });
  const [problem, setProblem] = useState<ApprovalProblem | null>(null);

  const failed = useCallback((error: unknown, back: ApprovalStep) => {
    console.warn("Signing a TV in failed:", error);
    setProblem(problemOf(error));
    setStep(back);
  }, []);

  const lookUp = useCallback(
    (code: string) => {
      setProblem(null);
      setStep({ kind: "checking" });
      lookUpTv(code)
        .then((asked) => setStep({ kind: "confirm", code, asked }))
        .catch((error: unknown) => failed(error, { kind: "code" }));
    },
    [failed],
  );

  const approve = useCallback(
    (code: string, learnerId: string) => {
      setProblem(null);
      setStep({ kind: "checking" });
      approveTv(code, learnerId)
        .then(() => {
          setStep({ kind: "done" });
          onChanged();
        })
        .catch((error: unknown) => failed(error, { kind: "code" }));
    },
    [failed, onChanged],
  );

  const deny = useCallback(
    (code: string) => {
      setStep({ kind: "checking" });
      denyTv(code)
        .then(() => setStep({ kind: "denied" }))
        .catch((error: unknown) => failed(error, { kind: "code" }));
    },
    [failed],
  );

  const reset = useCallback(() => {
    setProblem(null);
    setStep({ kind: "code" });
  }, []);

  return { step, problem, lookUp, approve, deny, reset };
}
