import { useCallback } from "react";
import { useNavigate } from "react-router";
import { chatPath, type ChatTarget } from "../lib/chat-targets";

export interface ChatOpening {
  draft?: string;
  fromLesson?: boolean;
}

export function useOpenChat() {
  const navigate = useNavigate();
  return useCallback(
    (target: ChatTarget, opening?: ChatOpening) =>
      navigate(chatPath(target), { state: opening }),
    [navigate],
  );
}
