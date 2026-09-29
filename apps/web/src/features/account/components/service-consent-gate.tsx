import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Learner } from "@/lib/account/account-store";
import { useI18n } from "@/lib/i18n-context";
import { useServiceStanding } from "../hooks/use-service-standing";
import { useSignOutToSignIn } from "../hooks/use-sign-out-to-sign-in";
import { AccountFrame } from "./account-frame";
import { ProblemNote } from "./problem-note";
import { ServiceAgreement } from "./service-agreement";

/** The pages of the learner in use open only once a parent has agreed to graspy teaching
 * them; until then this is all they show. Declining leads to choosing someone else. */
export function ServiceConsentGate({ children }: { children: ReactNode }) {
  const gate = useServiceStanding();
  if (gate.standing === "agreed") return children;
  return (
    <AccountFrame>
      <Waiting
        standing={gate.standing}
        learner={gate.learner}
        onAgreed={gate.agreed}
        onRetry={gate.recheck}
      />
    </AccountFrame>
  );
}

function Waiting({
  standing,
  learner,
  onAgreed,
  onRetry,
}: {
  standing: "checking" | "unchecked" | "needed";
  learner: Learner | null;
  onAgreed: () => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const leave = useSignOutToSignIn();
  if (standing === "needed" && learner) {
    return (
      <ServiceAgreement
        learner={learner}
        onAgreed={onAgreed}
        onDecline={() => navigate("/app/learners")}
        onSignOut={leave.start}
      />
    );
  }
  if (standing === "unchecked") {
    return (
      <div className="flex flex-col gap-3">
        <ProblemNote>{t("learners.loadFailed")}</ProblemNote>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onRetry}>
            {t("learners.tryAgain")}
          </Button>
          <Button variant="ghost" onClick={leave.start} disabled={leave.busy}>
            {t("you.signOut")}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <Spinner
      label={t("learners.opening")}
      className="mx-auto size-6 text-accent-ink"
    />
  );
}
