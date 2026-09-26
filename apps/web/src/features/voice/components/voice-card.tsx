import { useNavigate } from "react-router";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n-context";
import { HomeSection } from "@/features/learn/components/home-section";
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
