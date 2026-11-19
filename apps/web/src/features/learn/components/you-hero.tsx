import { UserRound } from "lucide-react";
import { Art } from "@/components/brand/art";
import { ageBand, type AgeBand } from "@/lib/age-band";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { useAccount } from "@/lib/account/use-account";
import { useI18n } from "@/lib/i18n-context";
import { levelLabel } from "@/lib/learner-level";
import type { UserProfile } from "@/lib/user-storage";

/** Who this device learns as: a portrait, the learner's name when an account gives one, and the class. */
export function YouHero({
  profile,
  className,
}: {
  profile: UserProfile;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const band = ageBand(profile);
  const name = useAccount()?.learner?.name.trim();
  const level = levelLabel(profile, t);
  return (
    <Card
      className={cn(
        "flex items-center gap-5 p-4 lg:gap-8 lg:p-6",
        band === "child" && "lg:gap-10",
        className,
      )}
    >
      <Portrait band={band} name={name} locale={locale} />
      <div className="min-w-0">
        {name ? (
          <>
            <h2 className="line-clamp-2 break-words font-display text-3xl font-semibold text-ink lg:text-4xl">
              {name}
            </h2>
            <p className="mt-1 text-lg text-muted">{level}</p>
          </>
        ) : (
          <h2 className="break-words font-display text-2xl font-semibold text-ink lg:text-4xl">
            {level}
          </h2>
        )}
      </div>
    </Card>
  );
}

/** A child and a tween see a drawn learner; a teen or university learner a monogram, with no cartoon. */
function Portrait({
  band,
  name,
  locale,
}: {
  band: AgeBand;
  name: string | undefined;
  locale: string;
}) {
  if (band === "teen") {
    return (
      <div
        aria-hidden="true"
        className="flex size-20 shrink-0 items-center justify-center rounded-full bg-accent font-display text-3xl font-semibold text-on-accent lg:size-32 lg:text-5xl"
      >
        {name ? (
          initialOf(name, locale)
        ) : (
          <UserRound className="size-1/2" aria-hidden="true" />
        )}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-control",
        band === "child" ? "size-32 lg:size-52" : "size-28 lg:size-44",
      )}
    >
      <Art name="english" band={band} eager className="object-top" />
    </div>
  );
}

/** The first letter the learner sees, whole: an emoji or an accented letter is not cut in half. */
function initialOf(name: string, locale: string): string {
  const [first] = new Intl.Segmenter(locale, {
    granularity: "grapheme",
  }).segment(name);
  return (first?.segment ?? "").toLocaleUpperCase(locale);
}
