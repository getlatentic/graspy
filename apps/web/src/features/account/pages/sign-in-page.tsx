import { Link, Navigate } from "react-router";
import { useAccount } from "@/lib/account/use-account";
import { FIREBASE_CONFIG } from "@/lib/env";
import { useI18n } from "@/lib/i18n-context";
import { AccountFrame } from "../components/account-frame";
import { GoogleSignInButton } from "../components/google-sign-in-button";

/** Signing in opens "Who's learning?" once Google answers. */
export default function SignInPage() {
  const account = useAccount();
  if (!FIREBASE_CONFIG) return <Navigate to="/app" replace />;
  if (account) return <Navigate to="/app/learners" replace />;
  return (
    <AccountFrame>
      <SignIn />
    </AccountFrame>
  );
}

function SignIn() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-balance font-display text-3xl font-bold text-ink">
        {t("signIn.title")}
      </h1>
      <div className="flex flex-col gap-3">
        <GoogleSignInButton variant="primary" size="lg" className="w-full" />
      </div>
      <p className="border-t border-line pt-5 text-sm text-muted">
        {t("signIn.newHere")}{" "}
        <Link
          to="/app"
          className="font-semibold text-accent-ink hover:underline"
        >
          {t("signIn.start")}
        </Link>
      </p>
    </div>
  );
}
