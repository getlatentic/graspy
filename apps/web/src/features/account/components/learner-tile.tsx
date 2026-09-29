import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import type { Learner } from "@/lib/account/account-store";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n-context";

const initialOf = (name: string) =>
  (Array.from(name.trim())[0] ?? "?").toLocaleUpperCase();

function Tile({
  face,
  label,
  note,
  restoreKey,
  disabled,
  onClick,
}: {
  face: ReactNode;
  label: string;
  note?: string;
  restoreKey: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-restore-focus={restoreKey}
      className="group flex w-full flex-col items-center gap-3 rounded-3xl p-3 text-center transition hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      {face}
      <span className="w-full truncate text-base font-semibold text-ink">
        {label}
      </span>
      {note && (
        <span className="-mt-2 text-xs font-medium text-accent-ink">
          {note}
        </span>
      )}
    </button>
  );
}

export function LearnerTile({
  learner,
  inUse,
  disabled,
  onChoose,
}: {
  learner: Learner;
  inUse: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Tile
      face={
        <span
          className={cn(
            "flex size-20 items-center justify-center rounded-full bg-accent-soft font-display text-3xl font-bold text-accent-ink ring-2 transition group-hover:ring-accent",
            inUse ? "ring-accent" : "ring-transparent",
          )}
          aria-hidden="true"
        >
          {initialOf(learner.name)}
        </span>
      }
      label={learner.name}
      note={inUse ? t("learners.inUse") : undefined}
      restoreKey={`tile-${learner.id}`}
      disabled={disabled}
      onClick={onChoose}
    />
  );
}

export function AddLearnerTile({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  return (
    <Tile
      face={
        <span
          className="flex size-20 items-center justify-center rounded-full border-2 border-dashed border-accent-line text-accent-ink transition group-hover:border-accent"
          aria-hidden="true"
        >
          <Plus className="size-8" />
        </span>
      }
      label={t("learners.addTile")}
      restoreKey="add-tile"
      disabled={disabled}
      onClick={onAdd}
    />
  );
}
