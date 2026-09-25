import { ASK_IDEAS } from "@/features/learn/lib/ask-ideas";
import type { AskIdea } from "@/lib/start-intent";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/cn";

interface TrySomethingNewProps {
  onPick: (idea: AskIdea) => void;
}

/** On a phone they scroll: three side by side would need text too small to read. */
export function TrySomethingNew({ onPick }: TrySomethingNewProps) {
  const { t } = useI18n();

  return (
    <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:px-0">
      {ASK_IDEAS.map(({ id, icon: Icon, titleKey, detailKey, tint }) => (
        <li key={id} className="w-52 shrink-0 snap-start sm:w-auto">
          <button
            type="button"
            onClick={() => onPick(id)}
            className="flex h-full w-full items-center gap-3 rounded-card border border-line bg-surface px-4 py-3.5 text-start transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Icon className={cn("size-6 shrink-0", tint)} aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink">
                {t(titleKey)}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted">
                {t(detailKey)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
