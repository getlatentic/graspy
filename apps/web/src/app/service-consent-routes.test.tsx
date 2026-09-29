// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccount } from "@/lib/account/account-store";
import { SERVICE_NOTICE } from "@/lib/account/consent-notices";
import { I18nContext } from "@/lib/i18n-context";
import { AGREED, listed, signedInAs } from "@/test/account-session";

// The learner's pages are the real layout and the real onboarding page. What they hold is not
// what is tested, so the parts that need a plan, a chat or a menu are stood in for.
const { listLearners, agreeToService, signInAgain } = vi.hoisted(() => ({
  listLearners: vi.fn(),
  agreeToService: vi.fn(),
  signInAgain: vi.fn(),
}));
vi.mock("@/lib/account/learners-api", () => ({ listLearners, agreeToService }));
vi.mock("@/lib/account/sign-in", async (original) => ({
  ...(await original<typeof import("@/lib/account/sign-in")>()),
  prepareSignIn: () => undefined,
  signInAgain,
}));
vi.mock("@/features/learn/learner-providers", () => ({
  LearnerProviders: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/features/learn/learner-context", () => ({
  usePlan: () => ({ isLoaded: true, curriculum: null }),
  useChat: () => ({ busyThreadId: null, unread: new Set() }),
}));
vi.mock("@/features/learn/hooks/use-learner-start", () => ({
  useLearnerStart: () => ({ onboardingCompleted: true }),
}));
vi.mock("@/features/learn/hooks/use-open-chat", () => ({
  useOpenChat: () => () => undefined,
}));
vi.mock("@/features/voice/hooks/use-kept-answers", () => ({
  useKeptAnswers: () => undefined,
}));
vi.mock("@/features/voice/hooks/use-voice-learner", () => ({
  useVoiceOnly: () => false,
}));
vi.mock("@/features/learn/components/top-menu", () => ({
  default: () => null,
}));
vi.mock("@/features/learn/components/app-tab-bar", () => ({
  AppTabBar: () => null,
}));
vi.mock("@/features/learn/components/tutor-ask-bar", () => ({
  TutorAskBar: () => null,
}));
vi.mock("@/hooks/use-visual-viewport", () => ({
  useVisualViewport: () => null,
}));
// The onboarding form, as when a plan stopped before it was kept.
vi.mock("@/features/onboarding/hooks/use-plan-setup", () => ({
  usePlanSetup: () => ({
    phase: "form",
    error: "stopped",
    busy: false,
    start: () => Promise.resolve(),
  }),
}));
vi.mock("@/features/onboarding/hooks/use-subject-choices", () => ({
  useSubjectChoices: () => ({ available: [], loading: false, error: null }),
}));
vi.mock("@/features/onboarding/components/steps/profile-step", () => ({
  default: () => null,
}));
vi.mock("@/features/onboarding/components/steps/subjects-step", () => ({
  default: () => null,
}));

const { default: DashboardLayout } = await import("./learn/layout");
const { default: OnboardingPage } =
  await import("@/features/onboarding/pages/onboarding");

const ADA = { id: "a00000000001", name: "Ada" };

const KEYS = {
  locale: "en",
  setLocale: () => undefined,
  t: (key: string) => key,
};

// A learner changing their details comes back to the form, with the stopped plan's message.
const REPLAN = {
  country: "NG",
  language: "en",
  system: "NG",
  level: "nursery-2",
  school: {
    names: { en: "nursery-2" },
    descriptor: "nursery-2",
    voiceOnly: true,
  },
  course: "",
};

function at(path: string) {
  render(
    <I18nContext.Provider value={KEYS}>
      <MemoryRouter
        initialEntries={[{ pathname: path, state: { replan: REPLAN } }]}
      >
        <Routes>
          <Route path="/app/learn" element={<DashboardLayout />}>
            <Route index element={<p>the learner's home</p>} />
          </Route>
          <Route path="/app/onboarding" element={<OnboardingPage />} />
        </Routes>
      </MemoryRouter>
    </I18nContext.Provider>,
  );
}

const learnersPage = () => screen.queryByText("the learner's home");
const onboardingForm = () => screen.queryByText("onboarding.generating.failed");

beforeEach(() => {
  vi.resetAllMocks();
  // jsdom has no scrolling: the page area scrolls to its top on each page.
  Element.prototype.scrollTo = () => undefined;
  window.localStorage.clear();
  signedInAs(ADA);
});

afterEach(() => {
  cleanup();
  setAccount(null);
});

describe("the learn layout", () => {
  it("shows the consent step, and none of the learner's pages, while no parent has agreed", async () => {
    listLearners.mockResolvedValue([listed(ADA.id, "Ada", null)]);

    at("/app/learn");

    expect(await screen.findByText(SERVICE_NOTICE)).toBeTruthy();
    expect(learnersPage()).toBeNull();
  });

  it("shows the learner's pages once a parent has agreed", async () => {
    listLearners.mockResolvedValue([listed(ADA.id, "Ada", AGREED)]);

    at("/app/learn");

    expect(await screen.findByText("the learner's home")).toBeTruthy();
    expect(screen.queryByText(SERVICE_NOTICE)).toBeNull();
  });
});

describe("onboarding", () => {
  it("shows the consent step, and not the form, while no parent has agreed", async () => {
    listLearners.mockResolvedValue([listed(ADA.id, "Ada", null)]);

    at("/app/onboarding");

    expect(await screen.findByText(SERVICE_NOTICE)).toBeTruthy();
    expect(onboardingForm()).toBeNull();
  });

  it("shows the form once a parent has agreed", async () => {
    listLearners.mockResolvedValue([listed(ADA.id, "Ada", AGREED)]);

    at("/app/onboarding");

    expect(
      await screen.findByText("onboarding.generating.failed"),
    ).toBeTruthy();
    expect(screen.queryByText(SERVICE_NOTICE)).toBeNull();
  });
});
