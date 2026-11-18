import { SceneBand } from "@/components/brand/scene";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n-context";
import { levelLabel } from "@/lib/learner-level";
import type { UserProfile } from "@/lib/user-storage";

/** The learner's class over a drawn scene: who this device learns as. */
export function YouHero({
  profile,
  className,
}: {
  profile: UserProfile;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <Card className={cn("overflow-hidden p-0 pb-5", className)}>
      <div className="h-32 lg:h-44">
        <SceneBand />
      </div>
      <h2 className="px-5 font-display text-2xl font-semibold text-ink">
        {levelLabel(profile, t)}
      </h2>
    </Card>
  );
}
