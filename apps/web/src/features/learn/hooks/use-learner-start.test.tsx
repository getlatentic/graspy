// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserProfile } from "@/lib/user-storage";

const generate = vi.fn();
const plan = {
  curriculum: {
    subjects: [] as unknown[],
    startedInChat: undefined as boolean | undefined,
  },
  isGenerating: false,
  generate,
  loadSaved: vi.fn(async () => undefined),
};
let profile: Partial<UserProfile> | null = null;

vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/i18n-context", () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));
vi.mock("@/lib/earlier-class", () => ({ placeEarlierClass: async () => {} }));
vi.mock("@/lib/user-storage", () => ({ getUserProfile: () => profile }));
vi.mock("@/features/voice/hooks/use-voice-learner", () => ({
  useVoiceOnly: () => false,
}));
vi.mock("../learner-context", () => ({ usePlan: () => plan }));

const { useLearnerStart } = await import("./use-learner-start");

const NIGERIAN = {
  onboardingCompleted: true,
  country: "NG",
  language: "en",
  preferredSubjects: [],
};

beforeEach(() => {
  generate.mockReset();
  plan.loadSaved.mockClear();
  plan.curriculum = { subjects: [], startedInChat: undefined };
});

/** After the plan has loaded, which is when a plan would be made. */
async function settled() {
  await waitFor(() => expect(plan.loadSaved).toHaveBeenCalled());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe("making the plan of a learner with no subjects", () => {
  it("is done for a learner who did onboarding, as before", async () => {
    profile = { ...NIGERIAN, gradeLevel: "JSS 1" };

    renderHook(() => useLearnerStart());

    await waitFor(() => expect(generate).toHaveBeenCalledOnce());
  });

  it("waits for the chat's plan, on whichever device and whatever the profile holds", async () => {
    profile = { ...NIGERIAN, gradeLevel: "" };
    plan.curriculum = { subjects: [], startedInChat: true };

    const { result } = renderHook(() => useLearnerStart());
    await settled();

    expect(result.current).not.toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it("is no longer waited for once the plan is one made some other way", async () => {
    profile = { ...NIGERIAN, gradeLevel: "JSS 1" };
    plan.curriculum = { subjects: [], startedInChat: true };
    const { rerender } = renderHook(() => useLearnerStart());
    await settled();
    expect(generate).not.toHaveBeenCalled();

    plan.curriculum = { subjects: [], startedInChat: undefined };
    rerender();

    await waitFor(() => expect(generate).toHaveBeenCalledOnce());
  });

  it("makes nothing for a learner with an empty class whose plan already has subjects", async () => {
    profile = { ...NIGERIAN, gradeLevel: "" };
    plan.curriculum = { subjects: [{}], startedInChat: undefined };

    renderHook(() => useLearnerStart());
    await settled();

    expect(generate).not.toHaveBeenCalled();
  });
});
