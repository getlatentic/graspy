import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  ApiError,
  CHALLENGE_FAILED,
  CHALLENGE_REQUIRED,
} from "@/lib/api/errors";
import { getSessionToken, refreshSessionToken } from "@/lib/api/session";
import { ChallengeError } from "@/lib/challenge/challenge";
import { useChallengeHost } from "@/lib/challenge/use-challenge-host";
import { useI18n } from "@/lib/i18n-context";

type Phase = "checking" | "ready" | "failed" | "unsupported" | "unavailable";

function refusal(error: unknown): Phase {
  if (error instanceof ChallengeError) {
    return error.kind === "unsupported" ? "unsupported" : "failed";
  }
  const refused =
    error instanceof ApiError &&
    (error.code === CHALLENGE_FAILED || error.code === CHALLENGE_REQUIRED);
  return refused ? "failed" : "unavailable";
}

/** Shows the page only once the visitor's session is minted, which is when the Turnstile check, if
 * the server asks for one, has been passed: once per visit, here, before any message. A check that
 * fails shows a short message with a retry, and a TV's browser, which cannot answer an interactive
 * check, is told to open graspy elsewhere. */
export function TryChallenge({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { container, running } = useChallengeHost();
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>("checking");

  useEffect(() => {
    let current = true;
    const minted = attempt === 0 ? getSessionToken() : refreshSessionToken();
    minted.then(
      () => current && setPhase("ready"),
      (error: unknown) => current && setPhase(refusal(error)),
    );
    return () => {
      current = false;
    };
  }, [attempt]);

  const retry = () => {
    setPhase("checking");
    setAttempt((count) => count + 1);
  };

  return (
    <>
      <div
        ref={container}
        role="group"
        aria-label={t("try.checkLabel")}
        hidden={!running}
        className="flex justify-center p-4"
      />
      {phase === "ready" ? (
        children
      ) : (
        <div
          role={phase === "checking" ? "status" : "alert"}
          className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
        >
          {phase === "checking" ? <Spinner /> : <Message phase={phase} />}
          {phase === "failed" || phase === "unavailable" ? (
            <Button onClick={retry}>{t("loading.tryAgain")}</Button>
          ) : null}
        </div>
      )}
    </>
  );
}

function Message({ phase }: { phase: Exclude<Phase, "checking" | "ready"> }) {
  const { t } = useI18n();
  const text = {
    failed: t("try.checkFailed"),
    unsupported: t("try.needsAnotherDevice"),
    unavailable: t("chat.temporaryProblem"),
  }[phase];
  return <p className="text-ink">{text}</p>;
}
