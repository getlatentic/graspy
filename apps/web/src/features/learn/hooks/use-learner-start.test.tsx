// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserProfile } from "@/lib/user-storage";

const generate = vi.fn();
const plan = {
  curriculum: { subjects: [] as unknown[] },
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
});

describe("making the plan of a learner with no subjects", () => {
  it("is done for a learner who did onboarding, whatever their class holds", async () => {
    profile = { ...NIGERIAN, gradeLevel: "" };

    renderHook(() => useLearnerStart());

    await waitFor(() => expect(generate).toHaveBeenCalledOnce());
  });

  it("is not done for a learner the try link's chat made ready: the plan they have is theirs, and a subject added there makes its topics", async () => {
    profile = { ...NIGERIAN, gradeLevel: "JSS 1", startedInChat: true };

    const { result } = renderHook(() => useLearnerStart());

    await waitFor(() => expect(plan.loadSaved).toHaveBeenCalled());
    await Promise.resolve();
    expect(result.current).not.toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });
});
