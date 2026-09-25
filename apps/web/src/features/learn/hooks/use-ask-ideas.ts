import { useCallback, useEffect } from "react";
import { useI18n } from "@/lib/i18n-context";
import { clearStart, readStart, type AskIdea } from "@/lib/start-intent";
import { draftFor } from "../lib/ask-ideas";
import type { ChatTarget } from "../lib/chat-targets";
import type { CurrentTopic } from "../lib/current-topic";
import { useOpenChat } from "./use-open-chat";

/** Practice goes to the current topic, other ideas to the general chat. A landing-page choice is replayed once `ready`. */
export function useAskIdeas(current: CurrentTopic | null, ready: boolean) {
  const { t } = useI18n();
  const openChat = useOpenChat();

  const ask = useCallback(
    (idea: AskIdea) => {
      const target: ChatTarget =
        idea === "practise" && current
          ? {
              kind: "topic",
              subjectSlug: current.subject.slug,
              topicIndex: current.topicIndex,
            }
          : { kind: "general" };
      openChat(target, { draft: draftFor(idea, current?.topic ?? null, t) });
    },
    [current, openChat, t],
  );

  useEffect(() => {
    if (!ready) return;
    const idea = readStart()?.ask;
    clearStart();
    if (idea) ask(idea);
  }, [ready, ask]);

  return ask;
}
