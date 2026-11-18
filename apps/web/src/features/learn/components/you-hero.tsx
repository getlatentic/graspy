import { Art } from "@/components/brand/art";
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
    <Card
      className={cn("flex items-center gap-5 p-4 lg:gap-8 lg:p-6", className)}
    >
      <div className="size-28 shrink-0 overflow-hidden rounded-control lg:size-44">
        <Art name="english" eager className="object-top" />
      </div>
      <h2 className="font-display text-2xl font-semibold text-ink lg:text-4xl">
        {levelLabel(profile, t)}
      </h2>
    </Card>
  );
}
