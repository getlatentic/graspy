import { useCallback, useRef } from "react";
import { appCall, type AppCallRequest } from "@/lib/a2a/request-data";
import type { ChatMessage } from "@/lib/chat-db";
import type { ViewHost } from "../ui-apps/view-bridge";

interface AppHostDeps {
  busy: boolean;
  ask: (text: string, calls: AppCallRequest[]) => void;
  keepViewCalls: (messageId: string, calls: AppCallRequest[]) => void;
}

const sameCall = (a: AppCallRequest, b: AppCallRequest) =>
  a.params.name === b.params.name &&
  JSON.stringify(a.params.arguments) === JSON.stringify(b.params.arguments);

const withCall = (calls: AppCallRequest[], call: AppCallRequest) =>
  calls.some((kept) => sameCall(kept, call)) ? calls : [...calls, call];

/** A view's tool calls wait, deduplicated, for the next message, which carries them to the tutor. */
export function useAppHost({ busy, ask, keepViewCalls }: AppHostDeps) {
  const pending = useRef<AppCallRequest[]>([]);

  return useCallback(
    (message: ChatMessage): ViewHost => ({
      toolCalled: (name, args) => {
        const call = appCall(name, args);
        pending.current = withCall(pending.current, call);
        keepViewCalls(
          message.id,
          withCall(message.metadata?.viewCalls ?? [], call),
        );
      },
      message: (text) => {
        if (busy) return false;
        ask(text, pending.current);
        pending.current = [];
        return true;
      },
    }),
    [ask, busy, keepViewCalls],
  );
}
