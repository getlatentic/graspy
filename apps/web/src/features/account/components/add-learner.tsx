import { useCallback, useState } from "react";
import { NOTICE_VERSION, SERVICE_NOTICE } from "@/lib/account/consent-notices";
import { useI18n } from "@/lib/i18n-context";
import { useAgreement } from "../hooks/use-agreement";
import type { useLearnerChoice } from "../hooks/use-learner-choice";
import { AddLearnerForm } from "./add-learner-form";
import { ConsentStep } from "./consent-step";

/** Adds a learner and opens the app as them: their name, then their parent's agreement.
 * A parent who does not agree adds no one. */
export function AddLearner({
  choice,
  onCancel,
}: {
  choice: ReturnType<typeof useLearnerChoice>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const { addAndChoose } = choice;
  const [name, setName] = useState("");
  const [asking, setAsking] = useState(false);

  const submit = useCallback(
    (firebaseIdToken: string) =>
      addAndChoose(name.trim(), {
        noticeVersion: NOTICE_VERSION,
        firebaseIdToken,
      }),
    [addAndChoose, name],
  );
  const agreement = useAgreement(submit);

  if (!asking) {
    return (
      <AddLearnerForm
        name={name}
        onName={setName}
        onContinue={() => setAsking(true)}
        onCancel={onCancel}
      />
    );
  }
  return (
    <ConsentStep
      title={t("consent.serviceTitle", { name: name.trim() })}
      notice={SERVICE_NOTICE}
      busy={agreement.busy || choice.busy}
      problem={agreement.problem}
      onAgree={agreement.agree}
      onDecline={onCancel}
    />
  );
}
