import { useMemo } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { ChatView } from "@/features/learn/components/chat-view";
import { ChatContextBar } from "@/features/learn/components/chat-context-bar";
import type { DraftSeed } from "@/features/learn/components/chat-composer";
import type { ChatOpening } from "@/features/learn/hooks/use-open-chat";
import {
  ASK_HUB,
  scopeOf,
  targetFromParams,
} from "@/features/learn/lib/chat-targets";
import { usePlan } from "@/features/learn/learner-context";

export default function ChatPage() {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { curriculum } = usePlan();

  const target = targetFromParams(params);
  const scope = target ? scopeOf(target, curriculum) : null;

  const opening = location.state as ChatOpening | null;
  const draft = opening?.draft;
  const seed = useMemo<DraftSeed | null>(
    () => (draft ? { text: draft, id: location.key } : null),
    [draft, location.key],
  );

  // Before the plan has loaded there is nothing to name a topic by.
  if (!curriculum?.planId || !curriculum.subjects.length) return null;
  if (!scope) return <Navigate to={ASK_HUB} replace />;

  return (
    <ChatView
      key={location.pathname}
      scope={scope}
      seed={seed}
      header={
        <ChatContextBar
          scope={scope}
          changeable
          // Going back returns to the lesson at the slide the learner left.
          onBackToLesson={opening?.fromLesson ? () => navigate(-1) : undefined}
        />
      }
    />
  );
}
