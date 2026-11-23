import { Link, Navigate } from "react-router";
import { Button } from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";
import { QrCode } from "@/components/ui/qr-code";
import { Spinner } from "@/components/ui/spinner";
import type { TvLinkRequest } from "@/lib/account/tv-link-api";
import { useAccount } from "@/lib/account/use-account";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n-context";
import { AccountFrame } from "../components/account-frame";
import { ProblemNote } from "../components/problem-note";
import { SIGN_IN_PAGE } from "../components/sign-in-link";
import { useSecondsLeft, useTvLink } from "../hooks/use-tv-link";

export const TV_SIGN_IN_PAGE = `${SIGN_IN_PAGE}/phone`;

const MESSAGES = {
  expired: "tvSignIn.expired",
  denied: "tvSignIn.denied",
  failed: "tvSignIn.failed",
} as const;

/** "Sign in with your phone", for a screen with a remote: a code, where to enter it and a QR code
 * for the same, with no text to type. The phone's approval signs this device in. */
export default function TvSignInPage() {
  const account = useAccount();
  if (account) return <Navigate to="/app" replace />;
  return (
    <AccountFrame wide>
      <TvLink />
    </AccountFrame>
  );
}

const minutesAndSeconds = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function TvLink() {
  const { t } = useI18n();
  const { state, again } = useTvLink();
  const left = useSecondsLeft(
    state.kind === "waiting" ? state.expiresAt : null,
  );
  const ended =
    state.kind === "waiting" && left === 0
      ? ({ kind: "expired" } as const)
      : state;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-balance font-display text-3xl font-semibold text-ink sm:text-4xl">
        {t("tvSignIn.title")}
      </h1>
      {ended.kind === "starting" && (
        <Spinner className="mx-auto size-6 text-accent-ink" />
      )}
      {ended.kind === "waiting" && (
        <Code request={ended.request} timeLeft={minutesAndSeconds(left)} />
      )}
      {(ended.kind === "expired" ||
        ended.kind === "denied" ||
        ended.kind === "failed") && (
        <ProblemNote>{t(MESSAGES[ended.kind])}</ProblemNote>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          variant={ended.kind === "waiting" ? "secondary" : "primary"}
          size="lg"
          onClick={again}
          autoFocus={ended.kind !== "waiting"}
        >
          {t("tvSignIn.newCode")}
        </Button>
        <Link
          to={SIGN_IN_PAGE}
          replace
          className={cn(buttonStyles("ghost", "lg"))}
        >
          {t("tvSignIn.cancel")}
        </Link>
      </div>
    </div>
  );
}

const withoutScheme = (uri: string) => uri.replace(/^https?:\/\//, "");

function Code({
  request,
  timeLeft,
}: {
  request: TvLinkRequest;
  timeLeft: string;
}) {
  const { t } = useI18n();
  const { userCode } = request;
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-10">
      <QrCode
        value={request.verificationUriComplete}
        label={t("tvSignIn.qr")}
        className="size-48 shrink-0 ring-1 ring-line sm:size-56 lg:size-64"
      />
      <div className="flex min-w-0 flex-col gap-3 text-center sm:text-start">
        <p className="text-pretty text-lg text-ink">{t("tvSignIn.open")}</p>
        <p
          dir="ltr"
          className="break-words text-xl font-semibold text-accent-ink sm:text-2xl"
        >
          {withoutScheme(request.verificationUri)}
        </p>
        <p
          dir="ltr"
          className="font-mono text-4xl font-bold tracking-widest text-ink sm:text-5xl"
        >
          <span aria-hidden="true">
            {userCode.slice(0, 4)} {userCode.slice(4)}
          </span>
          <span className="sr-only">{userCode.split("").join(" ")}</span>
        </p>
        <p className="text-base text-muted">
          {t("tvSignIn.expires", { time: timeLeft })}
        </p>
      </div>
    </div>
  );
}
