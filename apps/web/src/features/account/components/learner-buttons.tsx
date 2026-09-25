import { UserRound } from "lucide-react";
import { buttonStyles } from "@/components/ui/button-styles";
import type { Learner } from "@/lib/account/account-store";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n-context";

export function LearnerButtons({
  learners,
  inUse,
  busy,
  onChoose,
}: {
  learners: Learner[];
  inUse: string | null;
  busy: boolean;
  onChoose: (learner: Learner) => void;
}) {
  const { t } = useI18n();
  return (
    <ul className="flex flex-col gap-3">
      {learners.map((learner) => (
        <li key={learner.id}>
          <button
            type="button"
            disabled={busy}
            onClick={() => onChoose(learner)}
            className={cn(
              buttonStyles("secondary", "lg"),
              "w-full justify-start gap-3 py-4 text-start text-lg",
            )}
          >
            <UserRound className="size-5 text-accent-ink" aria-hidden="true" />
            <span className="flex-1 truncate">{learner.name}</span>
            {learner.id === inUse && (
              <span className="text-xs font-medium text-muted">
                {t("learners.inUse")}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
