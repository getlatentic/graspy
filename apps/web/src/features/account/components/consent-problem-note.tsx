import { useNavigate } from "react-router";
import type { ConsentProblem } from "@/lib/account/consent-problem";
import { useSignOut } from "@/features/learn/hooks/use-sign-out";
import { useI18n } from "@/lib/i18n-context";
import { ProblemNote } from "./problem-note";
import { SIGN_IN_PAGE } from "./sign-in-link";
import { SignOutControl } from "./sign-out-control";

const MESSAGES: Record<ConsentProblem, string> = {
  popupBlocked: "you.signInBlocked",
  browser: "consent.browser",
  signedOut: "consent.signedOut",
  otherAccount: "consent.otherAccount",
  notGoogle: "consent.notGoogle",
  signIn: "consent.signIn",
  notice: "consent.notice",
  notKept: "consent.notKept",
  failed: "learners.failed",
};

/** Says what to do about an agreement that did not go through, which is mostly to try again;
 * for a parent Firebase no longer holds signed in, it offers to sign in again. */
export function ConsentProblemNote({ problem }: { problem: ConsentProblem }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-start gap-2">
      <ProblemNote>{t(MESSAGES[problem])}</ProblemNote>
      {problem === "signedOut" && <SignInAgain />}
    </div>
  );
}

// Signing out as everywhere else: what is unsent goes first, or the parent is asked.
function SignInAgain() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const leave = useSignOut(() => navigate(SIGN_IN_PAGE, { replace: true }));
  return <SignOutControl leave={leave} label={t("consent.signInAgain")} />;
}
