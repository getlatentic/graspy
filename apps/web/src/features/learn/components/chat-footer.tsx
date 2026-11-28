import { useState } from "react";
import type { ChatMessage, ThreadScope } from "@/lib/chat-db";
import type { AppCallRequest } from "@/lib/a2a/request-data";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n-context";
import {
  composerPlaceholder,
  followUpsFor,
  planChangeFor,
  type ThreadState,
} from "@/features/learn/lib/chat-view-state";
import type { WelcomeChip } from "@/features/learn/lib/welcome-chips";
import {
  ChatComposer,
  type DraftSeed,
} from "@/features/learn/components/chat-composer";
import {
  FollowUps,
  WelcomeChips,
} from "@/features/learn/components/chat-suggestions";
import { PlanChangeCard } from "@/features/learn/components/plan-change-card";
import { useChat } from "../learner-context";

interface ChatFooterProps {
  scope: ThreadScope;
  subjectName: string;
  /** The welcome is showing: the composer sits in the middle with the chips, not at the foot. */
  welcoming: boolean;
  chips: WelcomeChip[];
  lastMessage: ChatMessage | undefined;
  state: ThreadState;
  ask: (text: string, calls?: AppCallRequest[]) => void;
  seed: DraftSeed | null;
}

export function ChatFooter({
  scope,
  subjectName,
  welcoming,
  chips,
  lastMessage,
  state,
  ask,
  seed,
}: ChatFooterProps) {
  const { t } = useI18n();
  const { stopTutor, confirmPlanChange, dismissPlanChange } = useChat();
  const followUps = followUpsFor(lastMessage, state);
  const planChange = planChangeFor(lastMessage, state);
  // A chip fills the composer, so it is kept out of the way of words already written.
  const [typing, setTyping] = useState(false);

  if (scope.kind === "earlier") return <EarlierNote />;

  return (
    <div
      className={cn(
        "bg-surface",
        welcoming ? "mb-auto" : "border-t border-line",
      )}
    >
      <div className="mx-auto w-full max-w-3xl p-3 sm:p-4">
        {planChange && (
          <PlanChangeCard
            change={planChange}
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
          onTyping={setTyping}
        />
        {welcoming && chips.length > 0 && (
          <WelcomeChips
            chips={chips}
            disabled={state.blocked}
            hidden={typing}
          />
        )}
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
