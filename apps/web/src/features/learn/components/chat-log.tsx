import { useState } from "react";
import { ArrowDown } from "lucide-react";
import type { ChatMessage } from "@/lib/chat-db";
import { TUTOR_TOOLS } from "@/lib/a2a/reply-data";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n-context";
import { Spinner } from "@/components/ui/spinner";
import type { Turn } from "@/features/learn/lib/chat-turns";
import type { ConversationScroll } from "@/features/learn/hooks/use-conversation-scroll";
import { ChatMessageItem } from "@/features/learn/components/chat-message";
import { AppFrame } from "@/features/learn/ui-apps/app-frame";
import type { ViewHost } from "@/features/learn/ui-apps/view-bridge";

const NAMED_TOOLS = new Set<string>(TUTOR_TOOLS);

interface ChatLogProps {
  scroll: ConversationScroll;
  /** Whether the conversation's stored messages have been read. */
  ready: boolean;
  turns: Turn[];
  welcome: string;
  hostFor: (message: ChatMessage) => ViewHost;
  /** The tool in use before the answer starts; undefined while nothing is awaited. */
  activity: string | null | undefined;
  changingPlan: boolean;
}

export function ChatLog({
  scroll,
  ready,
  turns,
  welcome,
  hostFor,
  activity,
  changingPlan,
}: ChatLogProps) {
  const { t } = useI18n();
  const lastTurn = turns[turns.length - 1];
  const arriving = useArriving(ready, turns);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroll.listRef}
        role="log"
        aria-live="polite"
        aria-label={t("chat.aiTutorTitle")}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5"
      >
        <div ref={scroll.contentRef} className="mx-auto max-w-3xl space-y-6">
          {ready && turns.length === 0 && (
            <p className="rounded-card bg-accent-soft p-4 text-sm text-ink">
              {welcome}
            </p>
          )}
          {turns.map((turn) => (
            <TurnSection
              key={turn.id}
              turn={turn}
              reserve={turn.id === scroll.liveTurn ? scroll.reserve : null}
              hostFor={hostFor}
              activity={turn === lastTurn ? activity : undefined}
              arriving={arriving}
            />
          ))}
          {changingPlan && (
            <p className="flex items-center gap-2 text-sm text-muted motion-safe:animate-enter">
              <Spinner />
              {t("chat.changingPlan")}
            </p>
          )}
        </div>
      </div>
      {!scroll.atEnd && <JumpToLatest onJump={scroll.jumpToEnd} />}
    </div>
  );
}

/** Only messages that arrive after the conversation opened animate in. */
function useArriving(ready: boolean, turns: Turn[]) {
  const [opened, setOpened] = useState<ReadonlySet<string> | null>(null);
  if (ready && opened === null) {
    setOpened(new Set(turns.flatMap((turn) => turn.messages.map((m) => m.id))));
  }
  return (id: string) => opened !== null && !opened.has(id);
}

interface TurnSectionProps {
  turn: Turn;
  arriving: (id: string) => boolean;
  /** The height kept for the live turn; null for any other. */
  reserve: number | null;
  hostFor: (message: ChatMessage) => ViewHost;
  activity: string | null | undefined;
}

function TurnSection({
  turn,
  reserve,
  hostFor,
  activity,
  arriving,
}: TurnSectionProps) {
  return (
    <section
      data-turn={turn.id}
      className="space-y-4"
      style={reserve === null ? undefined : { minHeight: reserve }}
    >
      {turn.messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            "space-y-4",
            arriving(message.id) && "motion-safe:animate-enter",
          )}
        >
          <ChatMessageItem message={message} />
          {message.metadata?.card && (
            <AppFrame card={message.metadata.card} host={hostFor(message)} />
          )}
        </div>
      ))}
      {activity !== undefined && <TutorActivity tool={activity} />}
    </section>
  );
}

function TutorActivity({ tool }: { tool: string | null }) {
  const { t } = useI18n();
  return (
    <div className="motion-safe:animate-enter">
      <p role="status" className="animate-pulse text-sm text-muted">
        {tool && NAMED_TOOLS.has(tool)
          ? t(`chat.activity.${tool}`)
          : t("chat.tutorThinking")}
      </p>
    </div>
  );
}

function JumpToLatest({ onJump }: { onJump: () => void }) {
  const { t } = useI18n();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
      <button
        type="button"
        onClick={onJump}
        aria-label={t("chat.jumpToLatest")}
        className="pointer-events-auto flex size-9 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-md hover:border-accent"
      >
        <ArrowDown className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
