import { Link } from "react-router";
import { useAccount } from "@/lib/account/use-account";
import { cn } from "@/lib/cn";
import { FIREBASE_CONFIG } from "@/lib/env";
import { useI18n } from "@/lib/i18n-context";

export const SIGN_IN_PAGE = "/app/sign-in";

/** Offered while nobody is signed in on the device. */
function useSignInOffered(): boolean {
  const account = useAccount();
  return FIREBASE_CONFIG !== null && account === null;
}

export function SignInLink({ className }: { className?: string }) {
  const { t } = useI18n();
  if (!useSignInOffered()) return null;
  return (
    <Link
      to={SIGN_IN_PAGE}
      className={cn(
        "text-sm font-semibold text-accent-ink transition hover:text-ink",
        className,
      )}
    >
      {t("signIn.link")}
    </Link>
  );
}

/** "Already learning with graspy? Sign in", beside a way to start. */
export function SignInPrompt({ className }: { className?: string }) {
  const { t } = useI18n();
  if (!useSignInOffered()) return null;
  return (
    <p className={cn("text-sm text-muted", className)}>
      {t("signIn.returning")}{" "}
      <Link
        to={SIGN_IN_PAGE}
        className="font-semibold text-accent-ink hover:underline"
      >
        {t("signIn.link")}
      </Link>
    </p>
  );
}
