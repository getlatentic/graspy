import { useCallback, useEffect, useState } from "react";
import { catalogue } from "@/lib/voice/voice-api";
import type { CatalogueLesson } from "@/lib/voice/voice-types";
import type { VoiceLearner } from "./use-voice-learner";

export type CatalogueState =
  | { name: "loading" }
  | { name: "failed" }
  | { name: "ready"; lessons: CatalogueLesson[] };

export function useVoiceCatalogue(learner: VoiceLearner) {
  const [state, setState] = useState<CatalogueState>({ name: "loading" });
  const [attempt, setAttempt] = useState(0);
  const { learnerClass, language } = learner;

  useEffect(() => {
    let live = true;
    catalogue(learnerClass, language)
      .then(({ lessons }) => live && setState({ name: "ready", lessons }))
      .catch(() => live && setState({ name: "failed" }));
    return () => {
      live = false;
    };
  }, [learnerClass, language, attempt]);

  const retry = useCallback(() => {
    setState({ name: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}
