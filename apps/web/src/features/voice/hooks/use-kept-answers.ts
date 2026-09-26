import { useEffect } from "react";
import { sendKeptAnswers } from "@/lib/voice/answer-outbox";
import { voiceLearnerKey } from "@/lib/voice/voice-learner-key";

/** Spoken answers kept while offline go when the app starts and whenever the connection returns. */
export function useKeptAnswers(): void {
  useEffect(() => {
    const send = () => {
      const learner = voiceLearnerKey();
      if (learner) void sendKeptAnswers(learner).catch(() => undefined);
    };
    send();
    window.addEventListener("online", send);
    return () => window.removeEventListener("online", send);
  }, []);
}
