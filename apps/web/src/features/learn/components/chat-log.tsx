import { useMemo, useState } from "react";
import { ArrowDown } from "lucide-react";
import type { ChatMessage } from "@/lib/chat-db";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n-context";
import { Spinner } from "@/components/ui/spinner";
import type { Turn } from "@/features/learn/lib/chat-turns";
import { replacedPathCards } from "@/features/learn/lib/path-card";
import type { ConversationScroll } from "@/features/learn/hooks/use-conversation-scroll";
import { ChatMessageItem } from "@/features/learn/components/chat-message";
import { AppFrame } from "@/features/learn/ui-apps/app-frame";
import type { ViewHost } from "@/features/learn/ui-apps/view-bridge";
import { TutorActivity } from "@/features/learn/components/tutor-activity";

interface ChatLogProps {
  scroll: ConversationScroll;
  /** Whether the conversation's stored messages have been read. */
  ready: boolean;
  turns: Turn[];
  welcome: string;
  /** A quiet line under the welcome of a conversation with nothing said yet. */
  note?: string;
  /** Kept above the messages once there are some. */
  welcomeStays?: boolean;
  /** Nothing has been said: the welcome is the title of the screen, centred above the composer. */
  welcoming?: boolean;
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
  note,
  welcomeStays = false,
  welcoming = false,
  hostFor,
  activity,
  changingPlan,
}: ChatLogProps) {
  const { t } = useI18n();
  const lastTurn = turns[turns.length - 1];
  const arriving = useArriving(ready, turns);
  const replaced = useMemo(
    () => replacedPathCards(turns.flatMap((turn) => turn.messages)),
    [turns],
  );

  return (
    <div
      className={cn(
        "relative flex flex-col",
        welcoming ? "mt-auto" : "min-h-0 flex-1",
      )}
    >
      <div
        ref={scroll.listRef}
        role="log"
        aria-live="polite"
        aria-label={t("chat.aiTutorTitle")}
        className={cn(
          "relative px-4 sm:px-5",
          welcoming
            ? "pt-5"
            : "min-h-0 flex-1 overflow-y-auto overscroll-contain py-5",
        )}
      >
        <div
          ref={scroll.contentRef}
          className={cn(
            "mx-auto max-w-3xl space-y-6",
            welcoming && "text-center",
          )}
        >
          {ready && welcoming && (
            <h1 className="text-balance font-display text-3xl font-semibold text-ink motion-safe:animate-enter lg:text-4xl">
              {welcome}
            </h1>
          )}
          {ready && !welcoming && (turns.length === 0 || welcomeStays) && (
            <p className="rounded-card bg-accent-soft p-4 text-sm text-ink">
              {welcome}
            </p>
          )}
          {ready && turns.length === 0 && note && (
            <p className="px-1 text-xs text-muted">{note}</p>
          )}
          {turns.map((turn) => (
            <TurnSection
              key={turn.id}
              turn={turn}
              reserve={turn.id === scroll.liveTurn ? scroll.reserve : null}
              hostFor={hostFor}
              activity={turn === lastTurn ? activity : undefined}
              arriving={arriving}
              replaced={replaced}
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
  /** The messages whose path card a newer one has replaced. */
  replaced: ReadonlySet<string>;
}

function TurnSection({
  turn,
  reserve,
  hostFor,
  activity,
  arriving,
  replaced,
}: TurnSectionProps) {
  const { t } = useI18n();
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
          {message.metadata?.card &&
            (replaced.has(message.id) ? (
              <p className="text-sm text-muted">{t("chat.pathReplaced")}</p>
            ) : (
              <AppFrame card={message.metadata.card} host={hostFor(message)} />
            ))}
        </div>
      ))}
      {activity !== undefined && <TutorActivity tool={activity} />}
    </section>
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
