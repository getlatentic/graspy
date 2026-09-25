import type { ChatMessage, ThreadScope } from "@/lib/chat-db";
import type { AppCallRequest } from "@/lib/a2a/request-data";
import { useI18n } from "@/lib/i18n-context";
import {
  composerPlaceholder,
  followUpsFor,
  type ThreadState,
} from "@/features/learn/lib/chat-view-state";
import {
  ChatComposer,
  type DraftSeed,
} from "@/features/learn/components/chat-composer";
import {
  FollowUps,
  StarterQuestions,
} from "@/features/learn/components/chat-suggestions";
import { PlanChangeCard } from "@/features/learn/components/plan-change-card";
import { useChat } from "../learner-context";

interface ChatFooterProps {
  scope: ThreadScope;
  subjectName: string;
  empty: boolean;
  lastMessage: ChatMessage | undefined;
  state: ThreadState;
  ask: (text: string, calls?: AppCallRequest[]) => void;
  seed: DraftSeed | null;
}

export function ChatFooter({
  scope,
  subjectName,
  empty,
  lastMessage,
  state,
  ask,
  seed,
}: ChatFooterProps) {
  const { t } = useI18n();
  const { stopTutor, confirmPlanChange, dismissPlanChange } = useChat();
  const followUps = followUpsFor(lastMessage, state);

  if (scope.kind === "earlier") return <EarlierNote />;

  return (
    <div className="border-t border-line bg-surface">
      <div className="mx-auto w-full max-w-3xl p-3 sm:p-4">
        {empty && scope.kind === "topic" && (
          <StarterQuestions
            topic={scope.topic}
            subject={subjectName}
            disabled={state.blocked}
            onAsk={ask}
          />
        )}
        {state.planChange && (
          <PlanChangeCard
            change={state.planChange}
            onConfirm={() => void confirmPlanChange()}
            onDismiss={dismissPlanChange}
          />
        )}
        {followUps.length > 0 && (
          <FollowUps questions={followUps} onAsk={ask} />
        )}
        <ChatComposer
          placeholder={composerPlaceholder(scope, subjectName, t)}
          blocked={state.blocked}
          answering={state.answering}
          onSend={ask}
          onStop={stopTutor}
          seed={seed}
        />
      </div>
    </div>
  );
}

function EarlierNote() {
  const { t } = useI18n();
  return (
    <p className="border-t border-line bg-raised px-4 py-3 text-center text-sm text-muted">
      {t("ask.earlierNote")}
    </p>
  );
}
