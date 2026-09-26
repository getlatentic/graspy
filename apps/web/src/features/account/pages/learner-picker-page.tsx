import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Account } from "@/lib/account/account-store";
import type { AccountLearner } from "@/lib/account/learners-api";
import { leaveForAnotherAccount } from "@/lib/account/sign-in";
import { useAccount } from "@/lib/account/use-account";
import { useI18n } from "@/lib/i18n-context";
import { AccountFrame } from "../components/account-frame";
import { AddLearnerForm } from "../components/add-learner-form";
import { AddLearnerTile, LearnerTile } from "../components/learner-tile";
import { ProblemNote } from "../components/problem-note";
import { SIGN_IN_PAGE } from "../components/sign-in-link";
import { useDeviceHoldsPlan } from "../hooks/use-device-plan";
import {
  useLearnerChoice,
  type ChoiceProblem,
} from "../hooks/use-learner-choice";
import { useLearners } from "../hooks/use-learners";

const MAX_LEARNERS = 8;

const PROBLEMS: Record<Exclude<ChoiceProblem, "unsent">, string> = {
  offline: "learners.offline",
  full: "learners.full",
  failed: "learners.failed",
};

/** "Who's learning?": the account's learners, one of whom the device learns as. */
export default function LearnerPickerPage() {
  const account = useAccount();
  if (!account) return <Navigate to={SIGN_IN_PAGE} replace />;
  return (
    <AccountFrame>
      <Picker account={account} />
    </AccountFrame>
  );
}

function Picker({ account }: { account: Account }) {
  const { t } = useI18n();
  const { learners, failed, reload } = useLearners();
  const choice = useLearnerChoice();
  const [adding, setAdding] = useState(false);

  if (failed) {
    return (
      <div className="flex flex-col gap-3">
        <ProblemNote>{t("learners.loadFailed")}</ProblemNote>
        <Button variant="secondary" className="self-start" onClick={reload}>
          {t("learners.tryAgain")}
        </Button>
      </div>
    );
  }
  if (!learners) return <Spinner className="mx-auto size-6 text-accent-ink" />;

  return (
    <div className="flex flex-col gap-6">
      {adding ? (
        <AddLearnerForm
          busy={choice.busy}
          onAdd={(name) => void choice.addAndChoose(name)}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Choosing
          account={account}
          learners={learners}
          busy={choice.busy}
          onChoose={(learner) => void choice.choose(learner)}
          onAdd={() => setAdding(true)}
        />
      )}
      <Status choice={choice} />
      <AccountLine account={account} />
    </div>
  );
}

function Choosing({
  account,
  learners,
  busy,
  onChoose,
  onAdd,
}: {
  account: Account;
  learners: AccountLearner[];
  busy: boolean;
  onChoose: (learner: AccountLearner) => void;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  const devicePlan = useDeviceHoldsPlan(account.deviceJoins);
  const full = learners.length >= MAX_LEARNERS;
  return (
    <>
      <div>
        {account.learner && <BackToYou />}
        <h1 className="text-balance font-display text-3xl font-bold text-ink">
          {t("learners.title")}
        </h1>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {learners.map((learner) => (
          <li key={learner.id}>
            <LearnerTile
              learner={learner}
              inUse={learner.id === account.learner?.id}
              disabled={busy}
              onChoose={() => onChoose(learner)}
            />
          </li>
        ))}
        {!full && (
          <li>
            <AddLearnerTile disabled={busy} onAdd={onAdd} />
          </li>
        )}
      </ul>
      {full && <p className="text-sm text-muted">{t("learners.full")}</p>}
      {devicePlan && (
        <p className="rounded-2xl bg-accent-soft/60 p-4 text-sm text-ink">
          {t("learners.devicePlan")}
        </p>
      )}
    </>
  );
}

function BackToYou() {
  const { t } = useI18n();
  return (
    <Link
      to="/app/learn/you"
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink hover:underline"
    >
      <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
      {t("learners.back")}
    </Link>
  );
}

function Status({ choice }: { choice: ReturnType<typeof useLearnerChoice> }) {
  const { t } = useI18n();
  if (choice.busy) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Spinner />
        {t("learners.opening")}
      </p>
    );
  }
  if (choice.problem === "unsent") {
    return <SwitchAnyway onAnyway={choice.anyway} onCancel={choice.cancel} />;
  }
  return choice.problem ? (
    <ProblemNote>{t(PROBLEMS[choice.problem])}</ProblemNote>
  ) : null;
}

function SwitchAnyway({
  onAnyway,
  onCancel,
}: {
  onAnyway: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <div role="alertdialog" className="flex flex-col gap-2">
      <p className="text-sm font-medium text-danger">{t("learners.unsent")}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onAnyway}>
          {t("learners.switchAnyway")}
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          {t("learners.cancel")}
        </Button>
      </div>
    </div>
  );
}

/** Who is signed in; before a learner is chosen, a wrong account can be left. */
function AccountLine({ account }: { account: Account }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const leave = () =>
    void leaveForAnotherAccount().finally(() => navigate(SIGN_IN_PAGE));
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-line pt-5 text-sm text-muted">
      {account.email && (
        <span className="min-w-0 truncate" dir="ltr">
          {account.email}
        </span>
      )}
      {account.deviceJoins && (
        <button
          type="button"
          onClick={leave}
          className="font-semibold text-accent-ink hover:underline"
        >
          {t("learners.otherAccount")}
        </button>
      )}
    </div>
  );
}
