import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Turn } from "../lib/chat-turns";
import { useChatScroll } from "./use-chat-scroll";

/** Call `pinNextTurn` as the learner sends. */
export function useConversationScroll(lastTurn: Turn | undefined) {
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { atEnd, reserve, measure, pin, jumpToEnd } = useChatScroll(
    listRef,
    contentRef,
  );
  const [liveTurn, setLiveTurn] = useState<string | null>(null);
  // The question renders a tick after the send, so the send leaves a mark.
  const pinNext = useRef(false);

  useLayoutEffect(() => {
    if (!pinNext.current || lastTurn?.messages[0]?.sender !== "user") return;
    pinNext.current = false;
    measure();
    setLiveTurn(lastTurn.id);
  }, [lastTurn, measure]);

  useLayoutEffect(() => {
    const turn = liveTurn
      ? contentRef.current?.querySelector<HTMLElement>(
          `[data-turn="${CSS.escape(liveTurn)}"]`,
        )
      : null;
    if (turn) pin(turn);
  }, [liveTurn, pin]);

  const pinNextTurn = useCallback(() => {
    pinNext.current = true;
  }, []);

  return {
    listRef,
    contentRef,
    atEnd,
    jumpToEnd,
    reserve,
    liveTurn,
    pinNextTurn,
  };
}

export type ConversationScroll = ReturnType<typeof useConversationScroll>;
