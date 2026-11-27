import { Link } from "react-router";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n-context";
import { useSignInOffered } from "../hooks/use-sign-in-offered";

export const SIGN_IN_PAGE = "/app/sign-in";
export const TV_SIGN_IN_PAGE = `${SIGN_IN_PAGE}/phone`;

export function SignInLink({
  className,
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  const { t } = useI18n();
  if (!useSignInOffered()) return null;
  return (
    <Link
      to={SIGN_IN_PAGE}
      onClick={onClick}
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
