import type { ConsentProblem } from "@/lib/account/consent-problem";
import { useI18n } from "@/lib/i18n-context";
import { ProblemNote } from "./problem-note";

const MESSAGES: Record<ConsentProblem, string> = {
  popupBlocked: "you.signInBlocked",
  otherAccount: "consent.otherAccount",
  signIn: "consent.signIn",
  notice: "consent.notice",
  failed: "learners.failed",
};

/** Says what to do about an agreement that did not go through, which is to try again. */
export function ConsentProblemNote({ problem }: { problem: ConsentProblem }) {
  const { t } = useI18n();
  return <ProblemNote>{t(MESSAGES[problem])}</ProblemNote>;
}
