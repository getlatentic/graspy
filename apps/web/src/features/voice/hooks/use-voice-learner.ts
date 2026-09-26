import { useSyncExternalStore } from "react";
import { currentAccount, onAccountChange } from "@/lib/account/account-store";
import { deviceId } from "@/lib/device-id";
import { useUserProfile } from "@/lib/use-user-profile";
import {
  classOf,
  lessonLanguageOf,
  voiceClassOf,
  voiceOnly,
} from "@/lib/voice/voice-learner";
import { voiceLearnerKey } from "@/lib/voice/voice-learner-key";
import type { LessonLanguage } from "@/lib/voice/voice-types";
import { usePlan } from "@/features/learn/learner-context";

export interface VoiceLearner {
  /** Whose answers these are, on this device. */
  key: string;
  speaker: string;
  learnerClass: string;
  language: LessonLanguage;
}

function useLearnerClass() {
  const profile = useUserProfile();
  const { curriculum } = usePlan();
  return { profile, details: classOf(curriculum, profile) };
}

/** The learner as voice lessons read them; null when their class has none. */
export function useVoiceLearner(): VoiceLearner | null {
  // Read again when the learner the device learns as changes.
  useSyncExternalStore(onAccountChange, currentAccount);
  const { profile, details } = useLearnerClass();
  const learnerClass = details ? voiceClassOf(details) : null;
  const key = voiceLearnerKey();
  if (!profile || !learnerClass || !key) return null;
  return {
    key,
    speaker: deviceId(),
    learnerClass,
    language: lessonLanguageOf(profile.language),
  };
}

/** Whether the learner's class learns by voice alone, with no slide subjects. */
export function useVoiceOnly(): boolean {
  const { details } = useLearnerClass();
  return details ? voiceOnly(details) : false;
}
