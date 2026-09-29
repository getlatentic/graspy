import { Link } from "react-router";
import { UserRound } from "lucide-react";
import { buttonStyles } from "@/components/ui/button-styles";
import { Card } from "@/components/ui/card";
import { GoogleSignInButton } from "@/features/account/components/google-sign-in-button";
import { SignOutControl } from "@/features/account/components/sign-out-control";
import type { Account } from "@/lib/account/account-store";
import { useAccount } from "@/lib/account/use-account";
import { FIREBASE_CONFIG } from "@/lib/env";
import { useI18n } from "@/lib/i18n-context";
import { LEARNERS_PAGE } from "../lib/app-sections";
import { useSignOut } from "../hooks/use-sign-out";

export function AccountCard() {
  if (!FIREBASE_CONFIG) return null;
  return <GoogleAccountCard />;
}

function GoogleAccountCard() {
  const { t } = useI18n();
  const account = useAccount();

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-muted">
        <UserRound className="size-4 text-accent-ink" aria-hidden="true" />
        {t("you.account")}
      </h2>
      {account ? <SignedIn account={account} /> : <SignedOut />}
    </Card>
  );
}

const LINK = buttonStyles("secondary", "sm");

function SignedIn({ account }: { account: Account }) {
  const { t } = useI18n();
  return (
    <>
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
      {account.learner && (
        <p className="text-ink">
          {t("you.learningAs", { name: account.learner.name })}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Link to="/app/learners" className={LINK}>
          {t("you.switchLearner")}
        </Link>
        <Link to={LEARNERS_PAGE} className={LINK}>
          {t("you.manageLearners")}
        </Link>
      </div>
      <SignOut />
    </>
  );
}

function SignOut() {
  const signOut = useSignOut();
  return <SignOutControl leave={signOut} className="self-start" />;
}

function SignedOut() {
  const { t } = useI18n();
  return (
    <>
      <p className="text-ink">{t("you.signInPrompt")}</p>
      <GoogleSignInButton />
    </>
  );
}
