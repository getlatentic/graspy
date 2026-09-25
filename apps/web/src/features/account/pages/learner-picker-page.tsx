import { Link, Navigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { Account } from "@/lib/account/account-store";
import { useAccount } from "@/lib/account/use-account";
import { useI18n } from "@/lib/i18n-context";
import { AddLearnerForm } from "../components/add-learner-form";
import { LearnerButtons } from "../components/learner-buttons";
import { ProblemNote } from "../components/problem-note";
import {
  useLearnerChoice,
  type ChoiceProblem,
} from "../hooks/use-learner-choice";
import { useLearners } from "../hooks/use-learners";

const MAX_LEARNERS = 8;

const PROBLEMS: Record<ChoiceProblem, string> = {
  unsent: "learners.unsent",
  full: "learners.full",
  failed: "learners.failed",
};

/** "Who's learning?": the account's learners, one of whom the device learns as. */
export default function LearnerPickerPage() {
  const account = useAccount();
  if (!account) return <Navigate to="/app" replace />;
  return (
    <main className="min-h-dvh bg-canvas px-4 py-10">
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <Heading account={account} />
        <Learners account={account} />
      </div>
    </main>
  );
}

function Heading({ account }: { account: Account }) {
  const { t } = useI18n();
  return (
    <div>
      {account.learner && (
        <Link
          to="/app/learn/you"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink hover:underline"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t("learners.back")}
        </Link>
      )}
      <h1 className="mt-4 text-balance text-2xl font-semibold text-ink">
        {t("learners.title")}
      </h1>
      <p className="mt-2 text-pretty text-muted">{t("learners.body")}</p>
      {account.email && (
        <p className="mt-2 text-sm text-muted" dir="auto">
          {t("learners.signedInAs", { email: account.email })}
        </p>
      )}
    </div>
  );
}

function Learners({ account }: { account: Account }) {
  const { t } = useI18n();
  const { learners, failed, reload } = useLearners();
  const choice = useLearnerChoice();

  if (failed) {
    return (
      <Card className="flex flex-col gap-3">
        <ProblemNote>{t("learners.loadFailed")}</ProblemNote>
        <Button variant="secondary" className="self-start" onClick={reload}>
          {t("learners.tryAgain")}
        </Button>
      </Card>
    );
  }
  if (!learners)
    return <Spinner className="size-6 self-center text-accent-ink" />;

  const full = learners.length >= MAX_LEARNERS;
  return (
    <Card className="flex flex-col gap-4">
      <LearnerButtons
        learners={learners}
        inUse={account.learner?.id ?? null}
        busy={choice.busy}
        onChoose={(learner) => void choice.choose(learner)}
      />
      {full ? (
        <p className="text-sm text-muted">{t("learners.full")}</p>
      ) : (
        <AddLearnerForm
          busy={choice.busy}
          onAdd={(name) => void choice.addAndChoose(name)}
        />
      )}
      {choice.busy && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner />
          {t("learners.opening")}
        </p>
      )}
      {choice.problem && (
        <ProblemNote>{t(PROBLEMS[choice.problem])}</ProblemNote>
      )}
    </Card>
  );
}
