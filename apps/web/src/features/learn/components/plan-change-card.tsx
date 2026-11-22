import type { PathProposal } from "@/features/learn/hooks/use-path-proposal";
import type { PendingPlanChange } from "@/features/learn/hooks/use-tutor-actions";
import type { LearningPath } from "@/lib/curriculum-api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useI18n, type Translate } from "@/lib/i18n-context";

// The rest is one line, so the composer stays on a phone's screen.
const PREVIEWED_STEPS = 4;

interface PlanChangeCardProps {
  change: PendingPlanChange;
  onConfirm: () => void;
  onDismiss: () => void;
  onRetry: (goal: string) => void;
}

export function PlanChangeCard({
  change,
  onConfirm,
  onDismiss,
  onRetry,
}: PlanChangeCardProps) {
  const { t } = useI18n();

  if (change.type === "propose_path") {
    return (
      <PathProposals
        proposals={change.proposals}
        onAccept={onConfirm}
        onDismiss={onDismiss}
        onRetry={onRetry}
      />
    );
  }

  return (
    <div
      role="group"
      aria-label={t("chat.confirmTitle")}
      className="mb-3 rounded-control border border-warning-line bg-warning-soft p-3 text-sm text-ink"
    >
      <p>
        {change.type === "rebuild_plan"
          ? t("chat.confirmRebuild")
          : t("chat.confirmRemove", { subjects: change.removed.join(", ") })}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onConfirm}>
          {t("chat.confirmYes")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          {t("chat.confirmNo")}
        </Button>
      </div>
    </div>
  );
}

interface PathProposalsProps {
  proposals: PathProposal[];
  onAccept: () => void;
  onDismiss: () => void;
  onRetry: (goal: string) => void;
}

const PATH_FRAME =
  "mb-3 rounded-control border border-accent-line bg-accent-soft p-3 text-sm text-ink";

function PathProposals({
  proposals,
  onAccept,
  onDismiss,
  onRetry,
}: PathProposalsProps) {
  const { t } = useI18n();
  const ready = proposals.filter(({ path }) => path).length;
  return (
    <div role="group" aria-label={t("chat.pathTitle")} className={PATH_FRAME}>
      <div className="space-y-3">
        {proposals.map((proposal) => (
          <PathProposalItem
            key={proposal.goal.toLocaleLowerCase()}
            proposal={proposal}
            onRetry={onRetry}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {ready > 0 && (
          <Button size="sm" onClick={onAccept}>
            {ready > 1 ? t("chat.pathAcceptAll") : t("chat.pathAccept")}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          {t("chat.pathNotNow")}
        </Button>
      </div>
    </div>
  );
}

function PathProposalItem({
  proposal,
  onRetry,
}: {
  proposal: PathProposal;
  onRetry: (goal: string) => void;
}) {
  const { t } = useI18n();
  if (proposal.failed) {
    return (
      <div>
        <p>{t("chat.pathFailed", { goal: proposal.goal })}</p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onRetry(proposal.goal)}
          className="mt-1"
        >
          {t("chat.pathRetry")}
        </Button>
      </div>
    );
  }
  if (!proposal.path) {
    return (
      <p role="status" className="flex items-center gap-2 text-accent-ink">
        <Spinner />
        {t("chat.pathPlanning", { goal: proposal.goal })}
      </p>
    );
  }
  return <PathPreview path={proposal.path} />;
}

function PathPreview({ path }: { path: LearningPath }) {
  const { t } = useI18n();
  const shown = path.steps.slice(0, PREVIEWED_STEPS);
  const more = path.steps.length - shown.length;

  return (
    <div>
      <p dir="auto" className="font-semibold">
        {path.subject}
      </p>
      <p className="mt-0.5 text-xs text-muted">{pathSummary(path, t)}</p>
      <ol className="mt-2 max-h-32 list-decimal space-y-1 overflow-y-auto ps-5">
        {shown.map((step) => (
          <li key={step.title} dir="auto">
            {step.title}{" "}
            <span className="text-xs text-muted">· {step.level}</span>
          </li>
        ))}
      </ol>
      {more > 0 && (
        <p className="mt-1 text-xs text-muted">
          {t("chat.pathMore", { count: more })}
        </p>
      )}
    </div>
  );
}

function pathSummary(path: LearningPath, t: Translate): string {
  const from = path.steps[0]?.level ?? "";
  const to = path.steps[path.steps.length - 1]?.level ?? "";
  const count = path.steps.length;
  return from === to
    ? t("chat.pathSummaryOneLevel", { count, level: from })
    : t("chat.pathSummary", { count, from, to });
}
