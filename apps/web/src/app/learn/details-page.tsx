import { useState } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation, useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import ProfileStep from "@/features/onboarding/components/steps/profile-step";
import {
  detailsChanged,
  detailsComplete,
  detailsOf,
  detailsSave,
  learnerDetails,
  learnsByVoiceAlone,
} from "@/features/onboarding/lib/details";
import { keptPlan } from "@/features/onboarding/lib/details-plan";
import { useVoiceOnly } from "@/features/voice/hooks/use-voice-learner";
import { keepRoute } from "@/lib/learner-route";
import {
  detailsSchema,
  type DetailsSchema,
} from "@/features/onboarding/schemas/onboarding-schema";
import { useI18n } from "@/lib/i18n-context";
import {
  getUserProfile,
  saveUserProfile,
  type UserProfile,
} from "@/lib/user-storage";
import { usePlan } from "@/features/learn/learner-context";

const YOU = "/app/learn/you";

// Details left half-changed on the way to a new plan, brought back.
type Draft = { draft?: DetailsSchema } | null;

export default function DetailsPage() {
  const { t } = useI18n();
  const draft = (useLocation().state as Draft)?.draft;
  const profile = getUserProfile();
  const methods = useForm<DetailsSchema>({
    resolver: zodResolver(detailsSchema),
    mode: "onChange",
    defaultValues: draft ?? (profile ? detailsOf(profile) : undefined),
  });
  if (!profile) return null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <Link
          to={YOU}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink hover:underline"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t("details.back")}
        </Link>
        <h1 className="mt-4 text-balance text-2xl font-semibold text-ink">
          {t("details.title")}
        </h1>
      </div>
      <FormProvider {...methods}>
        <ProfileStep suggestedCountry={profile.country} />
        <SaveDetails profile={profile} />
      </FormProvider>
    </div>
  );
}

function SaveDetails({ profile }: { profile: UserProfile }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { curriculum, applyCurriculum } = usePlan();
  const values = useFormContext<DetailsSchema>().watch();
  const voiceOnlyNow = useVoiceOnly() === true;
  const [asking, setAsking] = useState(false);

  const keepPlan = async () => {
    const details = learnerDetails(values);
    const voiceOnly = learnsByVoiceAlone(values, voiceOnlyNow);
    // The catalogue's word stands for the class until the server is asked about it.
    keepRoute(details, voiceOnly);
    saveUserProfile(details);
    const plan = await keptPlan(details, voiceOnly);
    if (plan) await applyCurriculum(plan);
    navigate(YOU);
  };
  const newPlan = () =>
    navigate("/app/onboarding", { state: { replan: values } });

  const save = () => {
    const choice = detailsSave(
      values,
      Boolean(curriculum?.subjects.length),
      voiceOnlyNow,
    );
    if (choice === "keep") void keepPlan();
    else if (choice === "new") newPlan();
    else setAsking(true);
  };

  if (!asking) {
    return (
      <Button
        onClick={save}
        disabled={!detailsChanged(profile, values) || !detailsComplete(values)}
        className="self-start"
      >
        {t("details.save")}
      </Button>
    );
  }
  return <AskNewPlan onNewPlan={newPlan} onKeepPlan={() => void keepPlan()} />;
}

function AskNewPlan({
  onNewPlan,
  onKeepPlan,
}: {
  onNewPlan: () => void;
  onKeepPlan: () => void;
}) {
  const { t } = useI18n();
  return (
    <Card className="flex flex-col gap-3" role="alertdialog">
      <h2 className="font-semibold text-ink">{t("details.askTitle")}</h2>
      <p className="text-pretty text-sm text-muted">{t("details.askBody")}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onNewPlan}>{t("details.newPlan")}</Button>
        <Button variant="secondary" onClick={onKeepPlan}>
          {t("details.keepPlan")}
        </Button>
      </div>
    </Card>
  );
}
