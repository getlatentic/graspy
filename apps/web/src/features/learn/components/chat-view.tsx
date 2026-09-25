import { useMemo, type ReactNode } from "react";
import type { ThreadScope } from "@/lib/chat-db";
import type { AppCallRequest } from "@/lib/a2a/request-data";
import { useI18n } from "@/lib/i18n-context";
import { useConversation } from "@/features/learn/hooks/use-conversation";
import { useConversationScroll } from "@/features/learn/hooks/use-conversation-scroll";
import { useAppHost } from "@/features/learn/hooks/use-app-host";
import { groupTurns } from "@/features/learn/lib/chat-turns";
import {
  scopeSubjectName,
  threadState,
} from "@/features/learn/lib/chat-view-state";
import { ChatLog } from "@/features/learn/components/chat-log";
import { ChatFooter } from "@/features/learn/components/chat-footer";
import type { DraftSeed } from "@/features/learn/components/chat-composer";
import { useChat, usePlan } from "../learner-context";

interface ChatViewProps {
  /** Never changes while shown. */
  scope: ThreadScope;
  header?: ReactNode;
  seed?: DraftSeed | null;
}

export function ChatView({ scope, header, seed = null }: ChatViewProps) {
  const { t } = useI18n();
  const { curriculum, isGenerating } = usePlan();
  const chat = useChat();
  const { threadId, conversation, ready } = useConversation(scope);
  const turns = useMemo(() => groupTurns(conversation), [conversation]);
  const scroll = useConversationScroll(turns[turns.length - 1]);
  const lastMessage = conversation[conversation.length - 1];
  const state = threadState(chat, threadId, isGenerating);

  const ask = (text: string, calls?: AppCallRequest[]) => {
    if (state.blocked) return;
    scroll.pinNextTurn();
    void chat.send(text, scope, t, calls);
  };
  const hostFor = useAppHost({
    busy: state.blocked,
    ask,
    keepViewCalls: chat.keepViewCalls,
  });

  const awaitingAnswer = state.answering && lastMessage?.sender === "user";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      {header}
      <ChatLog
        scroll={scroll}
        ready={ready}
        turns={turns}
        welcome={t(
          scope.kind === "general"
            ? "ask.anythingWelcome"
            : "chat.aiTutorWelcome",
        )}
        hostFor={hostFor}
        activity={awaitingAnswer ? chat.tutorActivity : undefined}
        changingPlan={state.changingPlan}
      />
      <ChatFooter
        scope={scope}
        subjectName={scopeSubjectName(curriculum, scope)}
        empty={conversation.length === 0}
        lastMessage={lastMessage}
        state={state}
        ask={ask}
        seed={seed}
      />
    </div>
  );
}
