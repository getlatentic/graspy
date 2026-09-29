import { Button } from "@/components/ui/button";
import type { ConsentProblem } from "@/lib/account/consent-problem";
import { useI18n } from "@/lib/i18n-context";
import { useSignOutToSignIn } from "../hooks/use-sign-out-to-sign-in";
import { ProblemNote } from "./problem-note";

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

function SignInAgain() {
  const { t } = useI18n();
  const leave = useSignOutToSignIn();
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={leave.start}
      disabled={leave.busy}
    >
      {t("consent.signInAgain")}
    </Button>
  );
}
