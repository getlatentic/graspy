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
  // A learner the try link's chat made ready has their plan made by adding a subject there:
  // a plan made from a profile with no class would replace the chat's, and its learner's.
  const wanted =
    profile !== null &&
    !profile.startedInChat &&
    planWanted(curriculum, voiceOnly);
  useEffect(() => {
    if (!profile || !loaded || !wanted || isGenerating) return;
    if (generated.current) return;
    generated.current = true;
    generate(curriculumRequest(profile), t);
  }, [profile, loaded, wanted, isGenerating, generate, t]);

  return profile;
}
