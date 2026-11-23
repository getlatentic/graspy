import { useCallback, type ReactNode } from "react";
import type { Learner } from "@/lib/account/account-store";
import { NOTICE_VERSION, SERVICE_NOTICE } from "@/lib/account/consent-notices";
import {
  agreeToService,
  type ServiceConsent,
} from "@/lib/account/learners-api";
import { keepServiceConsent } from "@/lib/account/service-consent";
import { useAccount } from "@/lib/account/use-account";
import { useI18n } from "@/lib/i18n-context";
import { useParentAgreement } from "../hooks/use-parent-agreement";
import { ConsentStep } from "./consent-step";
import { ParentGate } from "./parent-gate";

/** A parent agrees to graspy teaching a learner who has no agreement yet: the notice, then the
 * parent PIN. The learner stays unusable until they have. */
export function ServiceAgreement({
  learner,
  heading,
  busy = false,
  onAgreed,
  onDecline,
  signOut,
}: {
  learner: Learner;
  heading?: "h1" | "h2";
  /** Something the agreement led to is under way. */
  busy?: boolean;
  onAgreed: (consent: ServiceConsent) => void;
  onDecline: () => void;
  /** The control that signs out, for a parent who cannot agree here. */
  signOut?: ReactNode;
}) {
  const { t } = useI18n();
  const uid = useAccount()?.uid;
  const submit = useCallback(async () => {
    const consent = await agreeToService(learner.id, {
      noticeVersion: NOTICE_VERSION,
    });
    if (uid) keepServiceConsent(uid, learner.id);
    onAgreed(consent);
  }, [learner.id, uid, onAgreed]);
  const agreement = useParentAgreement(submit);
  if (agreement.asking) {
    return (
      <ParentGate
        heading={heading}
        onUnlocked={agreement.proceed}
        onCancel={agreement.cancel}
      />
    );
  }
  return (
    <ConsentStep
      heading={heading}
      title={t("consent.serviceTitle", { name: learner.name })}
      notice={SERVICE_NOTICE}
      busy={busy}
      problem={agreement.problem}
      onAgree={agreement.agree}
      onDecline={onDecline}
      signOut={signOut}
    />
  );
}
