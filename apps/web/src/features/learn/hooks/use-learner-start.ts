import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { getUserProfile, type UserProfile } from "@/lib/user-storage";
import { placeEarlierClass } from "@/lib/earlier-class";
import { useI18n } from "@/lib/i18n-context";
import { curriculumRequest } from "../lib/curriculum-request";
import { usePlan } from "../learner-context";

/** Null until the saved plan loads, so pages mount after it. */
export function useLearnerStart(): UserProfile | null {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { curriculum, isGenerating, generate, loadSaved } = usePlan();
  const [profile, setProfile] = useState<UserProfile | null>(null);
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

  const hasPlan = Boolean(curriculum?.subjects.length);
  useEffect(() => {
    if (!profile || !loaded || hasPlan || isGenerating) return;
    if (generated.current) return;
    generated.current = true;
    generate(curriculumRequest(profile), t);
  }, [profile, loaded, hasPlan, isGenerating, generate, t]);

  return profile;
}
