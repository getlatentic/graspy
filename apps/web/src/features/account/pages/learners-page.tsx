import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useAccount } from "@/lib/account/use-account";
import { useI18n } from "@/lib/i18n-context";
import { ConfirmCard } from "../components/confirm-card";
import { LearnerRow } from "../components/learner-row";
import { ProblemNote } from "../components/problem-note";
import { useManageLearners } from "../hooks/use-manage-learners";

type Manage = ReturnType<typeof useManageLearners>;

/** Renames and removes the account's learners, and deletes the account. */
export default function LearnersPage() {
  const { t } = useI18n();
  const manage = useManageLearners();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          to="/app/learn/you"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink hover:underline"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t("learners.back")}
        </Link>
        <h1 className="mt-4 text-balance text-2xl font-semibold text-ink">
          {t("learners.manageTitle")}
        </h1>
        <p className="mt-2 text-pretty text-muted">
          {t("learners.manageBody")}
        </p>
      </div>
      <LearnerList manage={manage} />
      {manage.failed && <ProblemNote>{t("learners.failed")}</ProblemNote>}
      <DeleteAccount manage={manage} />
    </div>
  );
}

function LearnerList({ manage }: { manage: Manage }) {
  const { t } = useI18n();
  const inUse = useAccount()?.learner?.id;
  if (!manage.learners) {
    return manage.failed ? (
      <Button
        variant="secondary"
        className="self-start"
        onClick={manage.reload}
      >
        {t("learners.tryAgain")}
      </Button>
    ) : (
      <Spinner className="size-6 text-accent-ink" />
    );
  }
  return (
    <Card className="p-0">
      <ul className="divide-y divide-line">
        {manage.learners.map((learner) => (
          <li key={learner.id} className="px-5 py-4">
            <LearnerRow
              learner={learner}
              inUse={learner.id === inUse}
              busy={manage.busy}
              onRename={(name) => manage.rename(learner.id, name)}
              onRemove={() => void manage.remove(learner.id)}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DeleteAccount({ manage }: { manage: Manage }) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-semibold text-ink">{t("learners.deleteTitle")}</h2>
      <p className="text-pretty text-sm text-muted">
        {t("learners.deleteBody")}
      </p>
      {asking ? (
        <ConfirmCard
          question={t("learners.deleteConfirm")}
          confirm={t("learners.deleteYes")}
          busy={manage.busy}
          onConfirm={() => void manage.deleteAccount()}
          onCancel={() => setAsking(false)}
        />
      ) : (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => setAsking(true)}
        >
          {t("learners.deleteButton")}
        </Button>
      )}
    </Card>
  );
}
