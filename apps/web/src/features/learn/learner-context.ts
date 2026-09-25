import { createContext, useContext, type Context } from "react";
import type { LearnerPlan } from "./hooks/use-learner-plan";
import type { TopicProgress } from "./hooks/use-topic-progress";
import type { TutorChat } from "./hooks/use-tutor-chat";

// Separate contexts so streaming chat answers do not re-render plan-only pages.
export const PlanContext = createContext<LearnerPlan | null>(null);
export const ProgressContext = createContext<TopicProgress | null>(null);
export const ChatContext = createContext<TutorChat | null>(null);

function useProvided<T>(context: Context<T | null>): T {
  const value = useContext(context);
  if (!value) throw new Error("Used outside the learner providers");
  return value;
}

export const usePlan = () => useProvided(PlanContext);
export const useProgress = () => useProvided(ProgressContext);
export const useChat = () => useProvided(ChatContext);
