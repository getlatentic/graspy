import { useNavigate } from "react-router";
import { GoogleSignInButton } from "@/features/account/components/google-sign-in-button";
import { FIREBASE_CONFIG } from "@/lib/env";
import { useI18n } from "@/lib/i18n-context";

/** A learner with an account signs in before making a plan here: a plan made first would
 * be newer than theirs, and replace it. */
export function ReturningLearner() {
  if (!FIREBASE_CONFIG) return null;
  return <SignInInstead />;
}

function SignInInstead() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <p className="text-sm text-muted">{t("onboarding.returning")}</p>
      <GoogleSignInButton
        size="sm"
        onSignedIn={() => navigate("/app/learners")}
      />
    </div>
  );
}
