import { Navigate } from "react-router";
import { Spinner } from "@/components/ui/spinner";
import { chatPath } from "@/features/learn/lib/chat-targets";
import { currentTopic } from "@/features/learn/lib/current-topic";
import { latestChat } from "@/features/learn/lib/latest-chat";
import { useChat, usePlan } from "@/features/learn/learner-context";

// Opens a conversation, not a menu of them: choosing another is the
// conversation's Change. Without a plan, Home shows it being made.
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
  if (!curriculum?.subjects.length) return <Navigate to="/app/learn" replace />;
  const target = latestChat(
    threads,
    curriculum,
    currentTopic(curriculum, nextSubject),
  );
  return <Navigate to={chatPath(target)} replace />;
}
