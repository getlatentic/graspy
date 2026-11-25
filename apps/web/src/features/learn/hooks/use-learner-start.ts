import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { getUserProfile, type UserProfile } from "@/lib/user-storage";
import { placeEarlierClass } from "@/lib/earlier-class";
import { useI18n } from "@/lib/i18n-context";
import { curriculumRequest, planWanted } from "../lib/curriculum-request";
import { usePlan } from "../learner-context";
import { useVoiceOnly } from "@/features/voice/hooks/use-voice-learner";

/** Null until the saved plan loads, so pages mount after it. */
export function useLearnerStart(): UserProfile | null {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { curriculum, isGenerating, generate, loadSaved } = usePlan();
  // Read at once, so the first frame draws the shell rather than nothing while the effect runs.
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const saved = getUserProfile();
    return saved?.onboardingCompleted ? saved : null;
  });
  const [loaded, setLoaded] = useState(false);
  // A ref: StrictMode's double effect run would read stale state.
  const generated = useRef(false);

  useEffect(() => {
    const saved = getUserProfile();
    if (!saved?.onboardingCompleted) {
      navigate("/app/onboarding");
      return;
    }
    setProfile(saved);
    placeEarlierClass().catch(() => undefined);
    loadSaved().then(() => setLoaded(true));
  }, [navigate, loadSaved]);

  const voiceOnly = useVoiceOnly();
  // The plan the try link's chat made has no subject or class yet: the chat adds them, and a
  // plan made from the profile now would replace it. Once a subject is there this is moot.
  const wanted =
    profile !== null &&
    !curriculum?.startedInChat &&
    planWanted(curriculum, voiceOnly);
  useEffect(() => {
    if (!profile || !loaded || !wanted || isGenerating) return;
    if (generated.current) return;
    generated.current = true;
    generate(curriculumRequest(profile), t);
  }, [profile, loaded, wanted, isGenerating, generate, t]);

  return profile;
}
