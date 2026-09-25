import { LogIn, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Account } from "@/lib/account/account-store";
import type { SignInProblem } from "@/lib/account/sign-in";
import { useAccount } from "@/lib/account/use-account";
import { FIREBASE_CONFIG } from "@/lib/env";
import { useI18n } from "@/lib/i18n-context";
import { useGoogleSignIn } from "../hooks/use-google-sign-in";

export function AccountCard() {
  if (!FIREBASE_CONFIG) return null;
  return <GoogleAccountCard />;
}

function GoogleAccountCard() {
  const { t } = useI18n();
  const account = useAccount();
  const google = useGoogleSignIn(account !== null);

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-muted">
        <UserRound className="size-4 text-accent-ink" aria-hidden="true" />
        {t("you.account")}
      </h2>
      {account ? (
        <SignedIn account={account} onSignOut={google.signOut} />
      ) : (
        <SignedOut
          busy={google.busy}
          problem={google.problem}
          onSignIn={google.signIn}
        />
      )}
    </Card>
  );
}

function SignedIn({
  account,
  onSignOut,
}: {
  account: Account;
  onSignOut: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {account.name && (
            <p className="truncate font-medium text-ink">{account.name}</p>
          )}
          {account.email && (
            <p className="truncate text-sm text-muted" dir="ltr">
              {account.email}
            </p>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={onSignOut}>
          {t("you.signOut")}
        </Button>
      </div>
      <p className="text-xs text-muted">{t("you.signedIn")}</p>
    </>
  );
}

function SignedOut({
  busy,
  problem,
  onSignIn,
}: {
  busy: boolean;
  problem: SignInProblem | null;
  onSignIn: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <p className="text-ink">{t("you.signInPrompt")}</p>
      <Button
        variant="secondary"
        className="self-start"
        onClick={onSignIn}
        disabled={busy}
      >
        <LogIn className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        {busy ? t("you.signingIn") : t("you.signIn")}
      </Button>
      {problem && (
        <p role="alert" className="text-sm font-medium text-danger">
          {problem === "popupBlocked"
            ? t("you.signInBlocked")
            : t("you.signInFailed")}
        </p>
      )}
    </>
  );
}
