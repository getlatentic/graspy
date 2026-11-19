import { useAccount } from "@/lib/account/use-account";
import { useI18n } from "@/lib/i18n-context";
import { levelLabel } from "@/lib/learner-level";
import { useUserProfile } from "@/lib/use-user-profile";

// Isolates a typed name from the words around it, so a name written the other way round keeps its place.
const isolated = (name: string) => `\u2068${name}\u2069`;

/** Who Home is for. While the plan is made it adds the class, as Home has nothing else to say yet. */
export function WelcomeLine({
  className,
  withClass = true,
}: {
  className?: string;
  withClass?: boolean;
}) {
  const { t } = useI18n();
  const name = useAccount()?.learner?.name.trim();
  const profile = useUserProfile();
  const level = withClass && profile ? levelLabel(profile, t).trim() : "";
  const title = name
    ? t("planBuilding.welcome", { name: isolated(name) })
    : t("planBuilding.welcomeAnonymous");

  return (
    <header className={className}>
      <h1
        title={title}
        className="line-clamp-2 text-balance break-words text-2xl font-semibold text-ink"
      >
        {title}
      </h1>
      {level && (
        <p className="mt-1 text-muted">{t("planBuilding.intro", { level })}</p>
      )}
    </header>
  );
}
