import { Link } from "react-router";
import { ChevronRight, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n-context";
import { getCountryName, getLanguageName } from "@/lib/locale";
import { levelLabel } from "@/lib/learner-level";
import { DETAILS_PAGE } from "@/features/learn/lib/app-sections";
import { useUserProfile } from "@/lib/use-user-profile";
import type { UserProfile } from "@/lib/user-storage";
import { ProgressSummary } from "@/features/learn/components/progress-summary";
import { PracticeRecordCard } from "@/features/learn/components/practice-record-card";
import { AccountCard } from "@/features/learn/components/account-card";
import { useVoiceOnly } from "@/features/voice/hooks/use-voice-learner";

export default function YouPage() {
  const { t } = useI18n();
  const profile = useUserProfile();
  // Topics learnt and practice come from slide subjects and Ask, which a class
  // that learns by voice alone does not have.
  const voiceOnly = useVoiceOnly() === true;
  if (!profile) return null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold text-ink">
        {t("nav.you")}
      </h1>

      {!voiceOnly && <ProgressSummary />}

      {!voiceOnly && <PracticeRecordCard />}

      <DetailsCard profile={profile} />

      <AccountCard />

      {!voiceOnly && <EditSubjects />}
    </div>
  );
}

function EditSubjects() {
  const { t } = useI18n();
  return (
    <Link
      to="/app/learn/plan"
      className="flex items-center gap-3 rounded-card border border-line bg-surface px-5 py-4 hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Pencil className="size-5 text-accent-ink" aria-hidden="true" />
      <span className="flex-1 font-medium text-ink">
        {t("you.editSubjects")}
      </span>
      <ChevronRight
        className="size-4 text-muted rtl:rotate-180"
        aria-hidden="true"
      />
    </Link>
  );
}

function DetailsCard({ profile }: { profile: UserProfile }) {
  const { t, locale } = useI18n();
  const details = [
    { label: t("you.country"), value: getCountryName(profile.country, locale) },
    {
      label: t("you.language"),
      value: getLanguageName(profile.language, locale),
    },
    { label: t("you.grade"), value: levelLabel(profile, t) },
  ];

  return (
    <Card className="p-0">
      <div className="flex items-baseline justify-between gap-4 px-5 pt-4 pb-2">
        <h2 className="text-sm font-semibold text-muted">{t("you.details")}</h2>
        <Link
          to={DETAILS_PAGE}
          className="text-sm font-semibold text-accent-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t("you.change")}
        </Link>
      </div>
      <dl className="divide-y divide-line">
        {details.map(({ label, value }) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-4 px-5 py-3"
          >
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-end font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
