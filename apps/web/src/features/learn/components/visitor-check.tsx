import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  ApiError,
  CHALLENGE_FAILED,
  CHALLENGE_REQUIRED,
} from "@/lib/api/errors";
import { chatTokens } from "@/lib/api/chat-session";
import { cn } from "@/lib/cn";
import { ChallengeError } from "@/lib/challenge/challenge";
import { useChallengeHost } from "@/lib/challenge/use-challenge-host";
import { useAccount } from "@/lib/account/use-account";
import { useI18n } from "@/lib/i18n-context";

type Phase =
  "checking" | "ready" | "failed" | "unsupported" | "unavailable" | "reload";

type Refused = Exclude<Phase, "checking" | "ready">;

function refusal(error: unknown): Phase {
  if (error instanceof ChallengeError) {
    return error.kind === "unsupported" ? "unsupported" : "failed";
  }
  if (error instanceof ApiError && error.code === CHALLENGE_FAILED) {
    return "failed";
  }
  // Asked for a check this page does not know how to run: a build older than the server.
  if (error instanceof ApiError && error.code === CHALLENGE_REQUIRED) {
    return "reload";
  }
  return "unavailable";
}

/** Shows the chat of someone who has not signed in only once their session is minted, which is when
 * the Turnstile check, if the server asks for one, has been passed: once per visit, here, before
 * any message. While it runs the chat area says so, with the widget under the line when the
 * visitor has something to do. A check that fails shows a short message with a retry, and a TV's
 * browser, which cannot answer an interactive check, is told to open graspy elsewhere. An
 * account's chat needs none. */
export function VisitorCheck({ children }: { children: ReactNode }) {
  return useAccount() ? children : <Checked>{children}</Checked>;
}

function Checked({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { container, running, interactive } = useChallengeHost();
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>("checking");

  useEffect(() => {
    let current = true;
    const minted = attempt === 0 ? chatTokens.get() : chatTokens.refresh();
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

  const checking = phase === "checking";
  const ready = phase === "ready";

  return (
    <>
      <div
        className={cn(
          "flex flex-col items-center",
          ready ? "contents" : "flex-1 justify-center gap-4 p-6 text-center",
        )}
      >
        {checking && <Checking interactive={interactive} />}
        {/* The widget's room: held for the whole check so it can appear and leave without a
            jump. A token renewed in the middle of a chat asks in the middle of the screen, over
            the chat, which does not move. */}
        <div
          ref={container}
          role="group"
          aria-label={t("try.checkLabel")}
          hidden={!checking && !running}
          className={cn(
            // The widget is 300 by 65 CSS pixels whatever the root font size is.
            "h-[max(4.25rem,66px)] w-[max(18.75rem,300px)] max-w-full",
            ready &&
              "fixed inset-x-0 top-1/2 z-50 mx-auto -translate-y-1/2 rounded-card bg-surface shadow-lg",
            !interactive && "invisible",
          )}
        />
        {!ready && !checking && <Refusal phase={phase} onRetry={retry} />}
      </div>
      {ready && children}
    </>
  );
}

function Checking({ interactive }: { interactive: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-3">
      <Spinner
        decorative
        className={cn(
          "size-6 motion-reduce:animate-none",
          interactive && "invisible",
        )}
      />
      <p role="status" className="text-ink">
        {t("try.checkLabel")}
      </p>
    </div>
  );
}

function Refusal({
  phase,
  onRetry,
}: {
  phase: Refused;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const text = {
    failed: t("try.checkFailed"),
    unsupported: t("try.needsAnotherDevice"),
    unavailable: t("chat.temporaryProblem"),
    reload: t("try.reload"),
  }[phase];
  return (
    <div role="alert" className="flex flex-col items-center gap-4">
      <p className="text-ink">{text}</p>
      {(phase === "failed" || phase === "unavailable") && (
        <Button onClick={onRetry}>{t("loading.tryAgain")}</Button>
      )}
      {phase === "reload" && (
        <Button onClick={() => window.location.reload()}>
          {t("try.reloadButton")}
        </Button>
      )}
    </div>
  );
}
