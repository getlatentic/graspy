import { useAccount } from "@/lib/account/use-account";
import { useI18n } from "@/lib/i18n-context";
import { levelLabel } from "@/lib/learner-level";
import { useUserProfile } from "@/lib/use-user-profile";

/** Who the plan is for, while it is being made: Home has nothing else to say yet. */
export function WelcomeLine({ className }: { className?: string }) {
  const { t } = useI18n();
  const name = useAccount()?.learner?.name;
  const profile = useUserProfile();

  return (
    <header className={className}>
      <h1 className="text-balance break-words text-2xl font-semibold text-ink">
        {name
          ? t("planBuilding.welcome", { name })
          : t("planBuilding.welcomeAnonymous")}
      </h1>
      {profile && (
        <p className="mt-1 text-muted">
          {t("planBuilding.intro", { level: levelLabel(profile, t) })}
        </p>
      )}
    </header>
  );
}
