import { Navigate } from "react-router";
import { VoiceLessons } from "@/features/voice/components/voice-lessons";
import { useVoiceLearner } from "@/features/voice/hooks/use-voice-learner";

export default function VoicePage() {
  if (!useVoiceLearner()) return <Navigate to="/app/learn" replace />;
  return <VoiceLessons />;
}
