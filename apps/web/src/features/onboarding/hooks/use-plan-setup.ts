import { useReducer, useRef, useState, type Dispatch } from "react";
import { useMutation } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n-context";
import { keepRoute } from "@/lib/learner-route";
import { saveUserProfile } from "@/lib/user-storage";
import { learnerDetails } from "../lib/details";
import {
  generatePlan,
  keepVoiceOnlyPlan,
  type GenerationStats,
  type PlanOrder,
} from "../lib/generate-plan";
import {
  FORM_SHOWN,
  GENERATION_STEP_SEQUENCE,
  keepAtOnce,
  planRequest,
  planSetupReducer,
  startSetup,
  type PlanSetupEvent,
} from "../lib/plan-setup-state";
import type { OnboardingSchema } from "../schemas/onboarding-schema";
import type { GeneratedSubject } from "../types";

const STEP_MS = 1500;

/** The learner sees progress however long the plan takes. */
async function paceTimeline(
  current: () => boolean,
  dispatch: Dispatch<PlanSetupEvent>,
) {
  for (let index = 1; index < GENERATION_STEP_SEQUENCE.length; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, STEP_MS));
    if (!current()) return;
    dispatch({ type: "paced", index });
  }
}

/** Reports nothing once `current` stops holding: the run was retried or
    abandoned. */
async function makePlan(
  make: () => Promise<GenerationStats>,
  current: () => boolean,
  dispatch: Dispatch<PlanSetupEvent>,
) {
  const timeline = paceTimeline(current, dispatch);
  try {
    const stats = await make();
    if (!current()) return;
    dispatch({ type: "made", stats });
    await timeline;
    if (!current()) return;
    saveUserProfile({ onboardingCompleted: true });
    dispatch({ type: "saved" });
  } catch (e) {
    if (current()) {
      dispatch({
        type: "failed",
        error: e instanceof Error ? e.message : "Error",
      });
    }
  }
}

async function keepLearner(
  data: OnboardingSchema,
  subjects: string[],
  setLocale: (locale: string) => void | Promise<void>,
) {
  try {
    await setLocale(data.language);
  } catch (e) {
    console.warn(e);
  }
  saveUserProfile({
    ...learnerDetails(data),
    preferredSubjects: subjects,
    onboardingCompleted: false,
  });
}

/** No subjects to choose and nothing for the model to make: the plan is kept at once. */
async function keepVoiceOnly(
  data: OnboardingSchema,
  setLocale: (locale: string) => void | Promise<void>,
) {
  await keepLearner(data, [], setLocale);
  await keepVoiceOnlyPlan(learnerDetails(data));
  // The catalogue's word stands for the class until the server is asked about it.
  keepRoute(learnerDetails(data), true);
  saveUserProfile({ onboardingCompleted: true });
}

export function usePlanSetup() {
  const { setLocale } = useI18n();
  const { mutateAsync: generate, isPending } = useMutation({
    mutationFn: generatePlan,
  });
  const [state, dispatch] = useReducer(planSetupReducer, FORM_SHOWN);
  const [subjectNames, setSubjectNames] = useState<string[]>([]);
  const [keeping, setKeeping] = useState(false);
  // A run reads these after its awaits, where state would be stale.
  const runRef = useRef<number | null>(null);
  const orderRef = useRef<PlanOrder | null>(null);

  const begin = (order: PlanOrder) => {
    const id = Date.now();
    runRef.current = id;
    orderRef.current = order;
    dispatch({ type: "started" });
    return () => runRef.current === id;
  };

  const keep = async (data: OnboardingSchema) => {
    setKeeping(true);
    await keepAtOnce(() => keepVoiceOnly(data, setLocale), dispatch);
    setKeeping(false);
  };

  const make = async (
    data: OnboardingSchema,
    available: GeneratedSubject[],
  ) => {
    const request = planRequest(data, available);
    const order = { request, learner: learnerDetails(data) };
    setSubjectNames(request.subjects);
    const current = begin(order);
    await keepLearner(data, request.subjects, setLocale);
    await makePlan(() => generate(order), current, dispatch);
  };

  const start = (data: OnboardingSchema, available: GeneratedSubject[]) =>
    startSetup(data, {
      keep: () => keep(data),
      make: () => make(data, available),
    });

  const retry = () => {
    const order = orderRef.current;
    if (!order) return;
    void makePlan(() => generate(order), begin(order), dispatch);
  };

  const reset = () => {
    runRef.current = null;
    dispatch({ type: "reset" });
  };

  return {
    ...state,
    subjectNames,
    pending: isPending,
    /** Includes an abandoned run still finishing. */
    busy: isPending || keeping || state.phase === "generating",
    start,
    retry,
    reset,
  };
}
