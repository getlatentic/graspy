import { Navigate } from "react-router";
import { Spinner } from "@/components/ui/spinner";
import { chatPath } from "@/features/learn/lib/chat-targets";
import { currentTopic } from "@/features/learn/lib/current-topic";
import { latestChat } from "@/features/learn/lib/latest-chat";
import { useChat, usePlan } from "@/features/learn/learner-context";

// Opens a conversation, not a menu of them: choosing another is the
// conversation's Change. Without a plan, Home shows it being made; a plan the chat started has
// no subjects yet, and the general conversation is where they are asked for.
export default function AskPage() {
  const { curriculum, nextSubject, isLoaded } = usePlan();
  const { threads, threadsLoaded } = useChat();
  if (!isLoaded || !threadsLoaded) {
    return (
      <div role="status" className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (curriculum?.startedInChat && !curriculum.subjects.length) {
    return <Navigate to={chatPath({ kind: "general" })} replace />;
  }
  if (!curriculum?.subjects.length) return <Navigate to="/app/learn" replace />;
  const target = latestChat(
    threads,
    curriculum,
    currentTopic(curriculum, nextSubject),
  );
  return <Navigate to={chatPath(target)} replace />;
}
