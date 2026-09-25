import type { ReactNode } from "react";
import { MessageCircle, Pencil, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-context";
import type { AskIdea } from "@/lib/start-intent";
import type { CurrentTopic } from "@/features/learn/lib/current-topic";
import { useOpenChat } from "@/features/learn/hooks/use-open-chat";
import { HomeSection } from "@/features/learn/components/home-section";
import { ProgressSummary } from "@/features/learn/components/progress-summary";

interface HomeRailProps {
  current: CurrentTopic | null;
  onAsk: (idea: AskIdea) => void;
}

export function HomeRail({ current, onAsk }: HomeRailProps) {
  const { t } = useI18n();
  const openChat = useOpenChat();

  return (
    <div className="flex flex-col gap-8">
      <HomeSection title={t("home.railAskTitle")}>
        <Action
          icon={MessageCircle}
          prompt={t("home.railAskPrompt")}
          label={
            current
              ? t("home.railAskTopic", { topic: current.topic })
              : t("ask.anything")
          }
          onClick={() =>
            current
              ? openChat({
                  kind: "topic",
                  subjectSlug: current.subject.slug,
                  topicIndex: current.topicIndex,
                })
              : openChat({ kind: "general" })
          }
        >
          {current && (
            <button
              type="button"
              onClick={() => openChat({ kind: "general" })}
              className="self-start text-sm font-medium text-accent-ink hover:underline"
            >
              {t("home.railAskAnything")}
            </button>
          )}
        </Action>
      </HomeSection>

      <HomeSection title={t("home.practiseTitle")}>
        <Action
          icon={Pencil}
          prompt={t("home.railPractisePrompt")}
          label={t("home.railPractiseStart")}
          onClick={() => onAsk("practise")}
        />
      </HomeSection>

      <HomeSection title={t("you.progress")}>
        <ProgressSummary />
      </HomeSection>
    </div>
  );
}

function Action({
  icon: Icon,
  prompt,
  label,
  onClick,
  children,
}: {
  icon: LucideIcon;
  prompt: string;
  label: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <p className="flex items-center gap-2.5 text-sm text-ink">
        <Icon className="size-5 shrink-0 text-accent" aria-hidden="true" />
        {prompt}
      </p>
      <Button variant="secondary" onClick={onClick} className="w-full">
        <span className="truncate">{label}</span>
      </Button>
      {children}
    </Card>
  );
}
