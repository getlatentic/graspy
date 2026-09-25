import type { ReactNode } from "react";
import { useLearnerPlan } from "./hooks/use-learner-plan";
import { useOffline } from "./hooks/use-offline";
import { useTopicProgress } from "./hooks/use-topic-progress";
import { useTutorChat } from "./hooks/use-tutor-chat";
import {
  ChatContext,
  PlanContext,
  ProgressContext,
  usePlan,
} from "./learner-context";

function ProgressProvider({ children }: { children: ReactNode }) {
  const { curriculum, isLoaded, isGenerating } = usePlan();
  const progress = useTopicProgress(curriculum, isLoaded && !isGenerating);
  useOffline(progress.reread);
  return (
    <ProgressContext.Provider value={progress}>
      {children}
    </ProgressContext.Provider>
  );
}

function ChatProvider({ children }: { children: ReactNode }) {
  const { curriculum, applyCurriculum, regenerate } = usePlan();
  const chat = useTutorChat({ curriculum, applyCurriculum, regenerate });
  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

export function LearnerProviders({ children }: { children: ReactNode }) {
  return (
    <PlanContext.Provider value={useLearnerPlan()}>
      <ProgressProvider>
        <ChatProvider>{children}</ChatProvider>
      </ProgressProvider>
    </PlanContext.Provider>
  );
}
