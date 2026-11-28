import { useMemo, useRef, useState, type ReactNode } from "react";
import type { ThreadScope } from "@/lib/chat-db";
import type { AppCallRequest } from "@/lib/a2a/request-data";
import { useAccount } from "@/lib/account/use-account";
import { useI18n } from "@/lib/i18n-context";
import { useConversation } from "@/features/learn/hooks/use-conversation";
import { useConversationScroll } from "@/features/learn/hooks/use-conversation-scroll";
import { useAppHost } from "@/features/learn/hooks/use-app-host";
import { useOpenLesson } from "@/features/learn/hooks/use-open-lesson";
import { groupTurns } from "@/features/learn/lib/chat-turns";
import { currentTopic } from "@/features/learn/lib/current-topic";
import { welcomeChips } from "@/features/learn/lib/welcome-chips";
import {
  isWelcoming,
  RECONNECTING,
  scopeSubjectName,
  threadState,
} from "@/features/learn/lib/chat-view-state";
import { ChatLog } from "@/features/learn/components/chat-log";
import { ChatFooter } from "@/features/learn/components/chat-footer";
import { VisitorCheck } from "@/features/learn/components/visitor-check";
import type { DraftSeed } from "@/features/learn/components/chat-composer";
import { cn } from "@/lib/cn";
import { useChat, usePlan } from "../learner-context";

interface ChatViewProps {
  /** Never changes while shown. */
  scope: ThreadScope;
  /** Given whether the welcome is showing, which the bar above the chat may answer to. */
  header?: (welcoming: boolean) => ReactNode;
  seed?: DraftSeed | null;
  /** Beside a lesson: the welcome is a smaller heading. */
  compact?: boolean;
}

export function ChatView({
  scope,
  header,
  seed = null,
  compact = false,
}: ChatViewProps) {
  const { t } = useI18n();
  const signedOut = useAccount() === null;
  const { curriculum, isGenerating, nextSubject } = usePlan();
  const chat = useChat();
  const { threadId, conversation, ready } = useConversation(scope);
  const turns = useMemo(() => groupTurns(conversation), [conversation]);
  const scroll = useConversationScroll(turns[turns.length - 1]);
  const lastMessage = conversation[conversation.length - 1];
  const state = threadState(chat, threadId, isGenerating);
  const [sending, setSending] = useState(false);

  const ask = (text: string, calls?: AppCallRequest[]) => {
    if (state.blocked) return;
    scroll.pinNextTurn();
    setSending(true);
    void chat.send(text, scope, t, calls).finally(() => setSending(false));
  };
  const open = useOpenLesson();
  const hostFor = useAppHost({
    busy: state.blocked,
    lastMessageId: lastMessage?.id,
    ask,
    keepViewCalls: chat.keepViewCalls,
    open,
  });

  // A learner with no subjects yet is asked what they would like to learn, and the question
  // stays in view while they answer it.
  const starting =
    scope.kind === "general" && curriculum?.subjects.length === 0;
  const awaitingAnswer = state.answering && lastMessage?.sender === "user";
  const welcoming = isWelcoming(
    scope,
    { threadsLoaded: chat.threadsLoaded, ready, sending },
    conversation.length,
    state,
  );
  const subjectName = scopeSubjectName(curriculum, scope);
  const [draft, fill] = useFilledDraft(seed);
  const chips = sending
    ? []
    : welcomeChips({
        scope,
        subjectName,
        current: currentTopic(curriculum, nextSubject),
        starting,
        t,
        ask,
        fill,
      });

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      {header?.(welcoming)}
      <VisitorCheck>
        {/* One column whether welcoming or not, so the composer is never mounted twice. */}
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            welcoming && "overflow-y-auto overscroll-contain",
          )}
        >
          <ChatLog
            scroll={scroll}
            ready={ready}
            turns={turns}
            welcome={t(
              starting
                ? "chat.startWelcome"
                : scope.kind === "general"
                  ? "ask.anythingWelcome"
                  : "chat.aiTutorWelcome",
            )}
            note={signedOut ? t("chat.deviceOnly") : undefined}
            welcomeStays={starting}
            welcoming={welcoming}
            compact={compact}
            hostFor={hostFor}
            activity={
              state.answering && chat.reconnecting
                ? RECONNECTING
                : awaitingAnswer
                  ? chat.tutorActivity
                  : undefined
            }
            changingPlan={state.changingPlan}
          />
          <ChatFooter
            scope={scope}
            subjectName={subjectName}
            welcoming={welcoming}
            chips={chips}
            lastMessage={lastMessage}
            state={state}
            ask={ask}
            seed={draft}
          />
        </div>
      </VisitorCheck>
    </div>
  );
}

/** The words to put in the composer: a chip's, until a newer seed arrives from the route. */
function useFilledDraft(seed: DraftSeed | null) {
  const [filled, setFilled] = useState<{
    draft: DraftSeed;
    over: DraftSeed | null;
  } | null>(null);
  const picks = useRef(0);
  const fill = (text: string) =>
    setFilled({ draft: { text, id: `chip-${picks.current++}` }, over: seed });
  return [filled && filled.over === seed ? filled.draft : seed, fill] as const;
}
