import { useEffect, useSyncExternalStore } from "react";
import { currentAccount, onAccountChange } from "@/lib/account/account-store";
import { deviceId } from "@/lib/device-id";
import {
  askRoute,
  keptRoute,
  onRouteKept,
  routeKey,
} from "@/lib/learner-route";
import { useUserProfile } from "@/lib/use-user-profile";
import {
  classOf,
  lessonLanguageOf,
  voiceClassOf,
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

/** Whether the server has the learner's class learn by voice alone, with no slide subjects;
 * null until it has said, here or on an earlier visit. */
export function useVoiceOnly(): boolean | null {
  const { details } = useLearnerClass();
  const { isLoaded } = usePlan();
  const key = details ? routeKey(details) : null;
  const kept = useSyncExternalStore(onRouteKept, () =>
    details ? keptRoute(details) : null,
  );

  useEffect(() => {
    if (isLoaded && details) void askRoute(details);
    // Keyed on the class: the details object is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, isLoaded]);

  return kept;
}
