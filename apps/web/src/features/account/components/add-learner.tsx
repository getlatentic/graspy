import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AccountLearner } from "@/lib/account/learners-api";
import { NOTICE_VERSION, SERVICE_NOTICE } from "@/lib/account/consent-notices";
import { useI18n } from "@/lib/i18n-context";
import { useParentAgreement } from "../hooks/use-parent-agreement";
import type { useLearnerChoice } from "../hooks/use-learner-choice";
import { AddLearnerForm } from "./add-learner-form";
import { ConsentStep } from "./consent-step";
import { ParentGate } from "./parent-gate";

/** The account holds the learner now, so all that is left is to open the app as them: trying
 * again chooses them, and never adds them a second time. */
function Added({
  learner,
  busy,
  onRetry,
  onCancel,
}: {
  learner: AccountLearner;
  busy: boolean;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-2xl font-semibold text-ink">
        {learner.name}
      </h1>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onRetry} disabled={busy}>
          {t("learners.tryAgain")}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {t("learners.cancel")}
        </Button>
      </div>
    </div>
  );
}

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
    () => addAndChoose(name.trim(), { noticeVersion: NOTICE_VERSION }),
    [addAndChoose, name],
  );
  const agreement = useParentAgreement(submit);

  if (choice.added) {
    return (
      <Added
        learner={choice.added}
        busy={choice.busy}
        onRetry={() => void choice.choose(choice.added as AccountLearner)}
        onCancel={onCancel}
      />
    );
  }
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
  if (agreement.asking) {
    return (
      <ParentGate
        heading="h1"
        onUnlocked={agreement.proceed}
        onCancel={agreement.cancel}
      />
    );
  }
  return (
    <ConsentStep
      title={t("consent.serviceTitle", { name: name.trim() })}
      notice={SERVICE_NOTICE}
      busy={choice.busy}
      problem={agreement.problem}
      onAgree={agreement.agree}
      onDecline={onCancel}
    />
  );
}
