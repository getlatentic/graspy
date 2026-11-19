import type { ReactNode } from "react";
import { MessageCircle, Pencil, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-context";
import type { AskIdea } from "@/lib/start-intent";
import type { CurrentTopic } from "@/features/learn/lib/current-topic";
import { useOpenChat } from "@/features/learn/hooks/use-open-chat";
import { ProgressSummary } from "@/features/learn/components/progress-summary";

interface HomeRailProps {
  current: CurrentTopic | null;
  onAsk: (idea: AskIdea) => void;
}

export function HomeRail({ current, onAsk }: HomeRailProps) {
  const { t } = useI18n();
  const openChat = useOpenChat();

  return (
    <Card className="flex flex-col gap-0 divide-y divide-line p-0">
      <RailBlock title={t("home.railAskTitle")}>
        <Action
          icon={MessageCircle}
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
      </RailBlock>

      <RailBlock title={t("home.practiseTitle")}>
        <Action
          icon={Pencil}
          label={t("home.railPractiseStart")}
          onClick={() => onAsk("practise")}
        />
      </RailBlock>

      <RailBlock title={t("you.progress")}>
        <ProgressSummary bare />
      </RailBlock>
    </Card>
  );
}

function RailBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="p-5">
      <h2 className="mb-3 font-sans text-base font-semibold text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Action({
  icon: Icon,
  label,
  onClick,
  children,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Button variant="secondary" onClick={onClick} className="w-full">
        <Icon className="size-5 shrink-0 text-accent" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </Button>
      {children}
    </div>
  );
}
