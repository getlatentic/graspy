import { Link, useNavigate } from "react-router";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n-context";
import { HomeSection } from "@/features/learn/components/home-section";
import { DETAILS_PAGE } from "@/features/learn/lib/app-sections";
import { useVoiceLearner } from "../hooks/use-voice-learner";
import { VOICE_PAGE } from "../lib/voice-paths";
import { TeacherStrip } from "./teacher-strip";

/** Home's way into voice lessons, shown only for a class that has them. */
export function VoiceCard({ className }: { className?: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  if (!useVoiceLearner()) return null;
  return (
    <HomeSection title={t("voice.title")} className={className}>
      <Card className="flex items-center justify-between gap-4">
        <TeacherStrip />
        <Button onClick={() => navigate(VOICE_PAGE)} className="shrink-0">
          <Mic className="size-4" aria-hidden="true" />
          {t("voice.start")}
        </Button>
      </Card>
    </HomeSection>
  );
}

/** Home for a class that learns by voice alone when the app has no voice lessons for it
 * yet: says so, and leads to the details in case the class is wrong. */
export function NoVoiceCard({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <HomeSection title={t("voice.title")} className={className}>
      <Card className="flex items-center justify-between gap-4">
        <p className="text-muted">{t("voice.noLessons")}</p>
        <Link
          to={DETAILS_PAGE}
          className="shrink-0 text-sm font-semibold text-accent-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t("you.change")}
        </Link>
      </Card>
    </HomeSection>
  );
}
