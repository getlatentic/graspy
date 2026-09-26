import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/cn";
import type { Standing } from "@/lib/voice/voice-types";

// Green is only for what is known; grey is not done.
const LOOK: Record<Standing, string> = {
  mastered: "bg-success-soft text-success",
  learnt: "bg-warning-soft text-warning",
  started: "bg-accent-soft text-accent-ink",
  untouched: "bg-track text-muted",
};

export function StandingChip({ standing }: { standing: Standing }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        LOOK[standing],
      )}
    >
      {t(`voice.standing.${standing}`)}
    </span>
  );
}
