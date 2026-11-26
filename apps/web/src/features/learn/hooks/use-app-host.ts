import { useCallback, useRef } from "react";
import { onceForAnswers } from "@/features/haptics/lib/answer-cue";
import { haptics } from "@/features/haptics/lib/haptics";
import { appCall, type AppCallRequest } from "@/lib/a2a/request-data";
import type { ChatMessage } from "@/lib/chat-db";
import { asksLearner } from "../lib/choice-card";
import type { ViewHost } from "../ui-apps/view-bridge";

interface AppHostDeps {
  busy: boolean;
  /** The last message of the conversation. */
  lastMessageId?: string;
  ask: (text: string, calls: AppCallRequest[]) => void;
  keepViewCalls: (messageId: string, calls: AppCallRequest[]) => void;
}

const sameCall = (a: AppCallRequest, b: AppCallRequest) =>
  a.params.name === b.params.name &&
  JSON.stringify(a.params.arguments) === JSON.stringify(b.params.arguments);

const withCall = (calls: AppCallRequest[], call: AppCallRequest) =>
  calls.some((kept) => sameCall(kept, call)) ? calls : [...calls, call];

const feltOnce = onceForAnswers();

/** A view's tool calls wait, deduplicated, for the next message, which carries them to the tutor. */
export function useAppHost({
  busy,
  lastMessageId,
  ask,
  keepViewCalls,
}: AppHostDeps) {
  const pending = useRef<AppCallRequest[]>([]);

  return useCallback(
    (message: ChatMessage): ViewHost => ({
      // Felt as the tap arrives, graded here as the card grades it. A card sends
      // its answers again with the message, and one kept on the message came
      // from an earlier visit: only a new tap is felt.
      toolCalling: (name, args) => {
        const cue = feltOnce(name, args);
        const known = (message.metadata?.viewCalls ?? []).some((earlier) =>
          sameCall(earlier, appCall(name, args)),
        );
        if (!cue || known) return;
        haptics.wake();
        haptics.trigger(cue);
      },
      toolCalled: (name, args) => {
        const call = appCall(name, args);
        const kept = message.metadata?.viewCalls ?? [];
        pending.current = withCall(pending.current, call);
        keepViewCalls(message.id, withCall(kept, call));
      },
      message: (text) => {
        const answered =
          asksLearner(message.metadata?.card?.resourceUri) &&
          message.id !== lastMessageId;
        if (busy || answered) return false;
        ask(text, pending.current);
        pending.current = [];
        return true;
      },
    }),
    [ask, busy, keepViewCalls, lastMessageId],
  );
}
