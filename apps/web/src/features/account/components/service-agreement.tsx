import { useCallback } from "react";
import type { Learner } from "@/lib/account/account-store";
import { NOTICE_VERSION, SERVICE_NOTICE } from "@/lib/account/consent-notices";
import {
  agreeToService,
  type ServiceConsent,
} from "@/lib/account/learners-api";
import { keepServiceConsent } from "@/lib/account/service-consent";
import { useAccount } from "@/lib/account/use-account";
import { useI18n } from "@/lib/i18n-context";
import { useAgreement } from "../hooks/use-agreement";
import { ConsentStep } from "./consent-step";

/** A parent agrees to graspy teaching a learner who has no agreement yet: the notice, then
 * signing in again. The learner stays unusable until they have. */
export function ServiceAgreement({
  learner,
  heading,
  busy = false,
  onAgreed,
  onDecline,
}: {
  learner: Learner;
  heading?: "h1" | "h2";
  /** Something the agreement led to is under way. */
  busy?: boolean;
  onAgreed: (consent: ServiceConsent) => void;
  onDecline: () => void;
}) {
  const { t } = useI18n();
  const uid = useAccount()?.uid;
  const submit = useCallback(
    async (firebaseIdToken: string) => {
      const consent = await agreeToService(learner.id, {
        noticeVersion: NOTICE_VERSION,
        firebaseIdToken,
      });
      if (uid) keepServiceConsent(uid, learner.id);
      onAgreed(consent);
    },
    [learner.id, uid, onAgreed],
  );
  const agreement = useAgreement(submit);
  return (
    <ConsentStep
      heading={heading}
      title={t("consent.serviceTitle", { name: learner.name })}
      notice={SERVICE_NOTICE}
      busy={agreement.busy || busy}
      problem={agreement.problem}
      onAgree={agreement.agree}
      onDecline={onDecline}
    />
  );
}
